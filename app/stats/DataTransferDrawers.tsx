"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, Download, FileSpreadsheet, LoaderCircle,
  Upload, X
} from "lucide-react";
import { api } from "@/lib/client";

type Source = "meals" | "manual" | "import";
type PreviewRow = {
  date: string;
  calories: number;
  activityCalories: number;
  weight: number;
  current: null | {
    weight: number | null;
    activityCalories: number;
    calories: number;
    source: Source;
    mealCalories: number;
    manualCalories: number | null;
    importedCalories: number | null;
  };
  availableSources: Source[];
  conflicts: { intake: boolean; weight: boolean; activity: boolean };
};
type Preview = {
  batch: { id: number; fileName: string; format: string; rowCount: number; expiresAt: string };
  rows: PreviewRow[];
};
type Decision = {
  source: Source;
  useImportedWeight: boolean;
  useImportedActivity: boolean;
};

const sourceLabels: Record<Source, string> = {
  meals: "餐食汇总",
  manual: "手工录入",
  import: "本次导入"
};

export function ImportDrawer({
  onClose,
  onImported
}: {
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState("");
  const [defaultSource, setDefaultSource] = useState<"import" | "meals">("import");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const conflictCount = useMemo(
    () => preview?.rows.filter(row => row.conflicts.intake || row.conflicts.weight || row.conflicts.activity).length ?? 0,
    [preview]
  );

  function decisionFor(row: PreviewRow): Decision {
    return decisions[row.date] ?? {
      source: defaultSource === "meals" && row.availableSources.includes("meals") ? "meals" : "import",
      useImportedWeight: !row.conflicts.weight,
      useImportedActivity: !row.conflicts.activity
    };
  }

  function updateDecision(date: string, patch: Partial<Decision>) {
    const row = preview?.rows.find(item => item.date === date);
    if (!row) return;
    setDecisions(current => ({ ...current, [date]: { ...decisionFor(row), ...patch } }));
  }

  function changeDefault(value: "import" | "meals") {
    setDefaultSource(value);
    setDecisions(current => {
      if (!preview) return current;
      return Object.fromEntries(preview.rows.map(row => {
        const existing = current[row.date];
        return [row.date, {
          source: value === "meals" && row.availableSources.includes("meals") ? "meals" : "import",
          useImportedWeight: existing?.useImportedWeight ?? !row.conflicts.weight,
          useImportedActivity: existing?.useImportedActivity ?? !row.conflicts.activity
        }];
      }));
    });
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(""); setFileName(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<Preview>("/api/data-imports/preview", { method: "POST", body });
      setPreview(result);
      setDecisions(Object.fromEntries(result.rows.map(row => [row.date, {
        source: "import" as Source,
        useImportedWeight: !row.conflicts.weight,
        useImportedActivity: !row.conflicts.activity
      }])));
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文件解析失败");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      await api(`/api/data-imports/${preview.batch.id}/commit`, {
        method: "POST",
        body: JSON.stringify({
          defaultSource,
          decisions: preview.rows.map(row => ({ date: row.date, ...decisionFor(row) }))
        })
      });
      await onImported();
      setStep(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入提交失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="record-backdrop" onMouseDown={onClose}>
    <aside className="record-drawer transfer-drawer" onMouseDown={event => event.stopPropagation()}>
      <div className="drawer-head">
        <div><p>DATA IMPORT</p><h2>导入每日数据</h2><span>上传、处理冲突并写入真实统计</span></div>
        <button onClick={onClose} aria-label="关闭"><X/></button>
      </div>
      <div className="import-steps">
        {["上传文件", "冲突预览", "导入完成"].map((label, index) =>
          <span className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} key={label}>
            <i>{step > index + 1 ? <Check/> : index + 1}</i>{label}
          </span>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}

      {step === 1 && <div className="import-upload-step">
        <label className="import-drop">
          {busy ? <LoaderCircle className="spin"/> : <Upload/>}
          <b>{busy ? "正在解析文件…" : "选择 Excel 或 CSV 文件"}</b>
          <span>支持 .xlsx 与 UTF-8 CSV，最多 5 MB / 5000 行</span>
          <input type="file" accept=".xlsx,.csv" disabled={busy} onChange={event => void selectFile(event.target.files?.[0])}/>
        </label>
        {fileName && <small className="selected-file"><FileSpreadsheet/> {fileName}</small>}
        <div className="template-links">
          <span>第一次使用？先下载标准模板</span>
          <a href="/api/data-imports/template?format=xlsx">Excel 模板</a>
          <a href="/api/data-imports/template?format=csv">CSV 模板</a>
        </div>
        <div className="import-rules"><AlertTriangle/><p><b>导入规则</b><span>日期必须为 YYYY-MM-DD；不接受公式、重复日期、负数或缺失字段。</span></p></div>
      </div>}

      {step === 2 && preview && <div className="import-preview-step">
        <div className="preview-summary">
          <div><FileSpreadsheet/><span><b>{preview.batch.fileName}</b><small>{preview.batch.rowCount} 行有效数据 · {conflictCount} 行存在冲突</small></span></div>
          <label>整批摄入默认来源<select value={defaultSource} onChange={event => changeDefault(event.target.value as "import" | "meals")}>
            <option value="import">使用本次导入</option><option value="meals">优先餐食汇总</option>
          </select></label>
        </div>
        <div className="preview-table-wrap"><table className="preview-table">
          <thead><tr><th>日期</th><th>导入数据</th><th>摄入来源</th><th>体重冲突</th><th>活动冲突</th></tr></thead>
          <tbody>{preview.rows.map(row => {
            const decision = decisionFor(row);
            return <tr key={row.date}>
              <td><b>{row.date}</b>{row.conflicts.intake && <small className="conflict-chip">摄入冲突</small>}</td>
              <td><span>{row.calories} kcal</span><small>{row.weight} kg · 活动 {row.activityCalories}</small></td>
              <td><select value={decision.source} onChange={event => updateDecision(row.date, { source: event.target.value as Source })}>
                {row.availableSources.map(source => <option value={source} key={source}>{sourceLabels[source]}</option>)}
              </select></td>
              <td>{row.conflicts.weight ? <label className="conflict-choice"><input type="checkbox" checked={decision.useImportedWeight} onChange={event => updateDecision(row.date, { useImportedWeight: event.target.checked })}/><span>用 {row.weight} kg<small>系统 {row.current?.weight ?? "—"}</small></span></label> : <span className="no-conflict">无冲突</span>}</td>
              <td>{row.conflicts.activity ? <label className="conflict-choice"><input type="checkbox" checked={decision.useImportedActivity} onChange={event => updateDecision(row.date, { useImportedActivity: event.target.checked })}/><span>用 {row.activityCalories}<small>系统 {row.current?.activityCalories ?? 0}</small></span></label> : <span className="no-conflict">无冲突</span>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <div className="transfer-footer"><button className="secondary" onClick={() => setStep(1)}>重新选择</button><button className="primary" disabled={busy} onClick={() => void commit()}>{busy ? <LoaderCircle className="spin"/> : <Upload/>} 确认导入</button></div>
      </div>}

      {step === 3 && preview && <div className="import-complete">
        <span><Check/></span><h3>数据导入完成</h3><p>{preview.batch.rowCount} 天的数据已写入统计。摄入来源、BMR、TEF、TDEE 和热量差已同步更新。</p>
        <button className="save-record" onClick={onClose}>查看统计结果 <ArrowRight/></button>
      </div>}
    </aside>
  </div>;
}

export function ExportDrawer({
  currentRange,
  onClose
}: {
  currentRange: string;
  onClose: () => void;
}) {
  const [range, setRange] = useState(currentRange);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const href = `/api/data-exports?range=${range}&format=${format}`;
  return <div className="record-backdrop" onMouseDown={onClose}>
    <aside className="record-drawer export-drawer" onMouseDown={event => event.stopPropagation()}>
      <div className="drawer-head">
        <div><p>DATA EXPORT</p><h2>导出统计数据</h2><span>包含来源候选值与全部派生指标</span></div>
        <button onClick={onClose} aria-label="关闭"><X/></button>
      </div>
      <div className="export-options">
        <fieldset><legend>时间范围</legend><div>{[
          ["7d", "最近 7 天"], ["30d", "最近 30 天"], ["90d", "最近 90 天"], ["all", "全部历史"]
        ].map(([value, label]) => <label className={range === value ? "selected" : ""} key={value}><input type="radio" checked={range === value} onChange={() => setRange(value)}/><span>{label}</span></label>)}</div></fieldset>
        <fieldset><legend>文件格式</legend><div>
          <label className={format === "xlsx" ? "selected" : ""}><input type="radio" checked={format === "xlsx"} onChange={() => setFormat("xlsx")}/><FileSpreadsheet/><span><b>Excel</b><small>适合继续编辑和分析</small></span></label>
          <label className={format === "csv" ? "selected" : ""}><input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")}/><FileSpreadsheet/><span><b>CSV</b><small>UTF-8 BOM，兼容中文</small></span></label>
        </div></fieldset>
      </div>
      <a className="save-record export-download" href={href} onClick={() => window.setTimeout(onClose, 300)}><Download/> 下载导出文件</a>
    </aside>
  </div>;
}
