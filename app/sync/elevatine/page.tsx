"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  FileImage,
  ImagePlus,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/web/client/client";
import { AppSidebar } from "@/web/components/AppSidebar";

type Item = {
  id: string;
  day_id: string | null;
  image_id: string | null;
  meal_label: string;
  meal_order: number;
  meal_time: string | null;
  food_name: string;
  quantity: number | string | null;
  unit: string | null;
  calories: number | string;
  carbohydrate: number | string | null;
  protein: number | string | null;
  fat: number | string | null;
  confidence: number | string | null;
  selected: boolean;
  match_status: "matched" | "ambiguous" | "unmatched" | "estimated" | "estimate_failed";
};
type Day = {
  id: string;
  record_date: string;
  selected: boolean;
  calories: number;
  carbohydrate: number | string | null;
  protein: number | string | null;
  fat: number | string | null;
  calories_goal: number | null;
  carbohydrate_goal: number | string | null;
  protein_goal: number | string | null;
  fat_goal: number | string | null;
  warnings: string[] | null;
  elevatine_import_item: Item[];
};
type ImageRow = {
  id: string;
  file_name: string;
  status: string;
  image_kind: string;
  confidence: number | string | null;
  error_message: string | null;
};
type Batch = {
  id: string;
  status: string;
  default_year: number;
  elevatine_import_image: ImageRow[];
  elevatine_import_day: Day[];
  unmatched: Item[];
};
type History = { id: string; status: string; imageCount: number; dayCount: number; createdAt: string };

const n = (value: number | string | null | undefined) => value == null ? 0 : Number(value);
const dateLabel = (value: string) => {
  const date = new Date(value);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
};

function Ring({ value, goal, color, label, unit }: {
  value: number; goal: number; color: string; label: string; unit: string;
}) {
  const percent = goal > 0 ? Math.min(100, value / goal * 100) : 0;
  return (
    <div className="eva-ring-wrap">
      <div className="eva-ring" style={{ "--eva-color": color, "--eva-p": `${percent * 3.6}deg` } as React.CSSProperties}>
        <div><b>{Math.round(value)}</b><span>/ {Math.round(goal || 0)}{unit}</span></div>
      </div>
      <span>{label}{unit ? `(${unit})` : ""}</span>
    </div>
  );
}

function FoodEditor({ batchId, item, onClose, onSaved }: {
  batchId: string; item: Item; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    foodName: item.food_name,
    quantity: item.quantity == null ? "" : String(item.quantity),
    unit: item.unit || "",
    calories: String(item.calories),
    carbohydrate: item.carbohydrate == null ? "" : String(item.carbohydrate),
    protein: item.protein == null ? "" : String(item.protein),
    fat: item.fat == null ? "" : String(item.fat)
  });
  const [busy, setBusy] = useState(false);
  const macros = n(form.carbohydrate) * 4 + n(form.protein) * 4 + n(form.fat) * 9;
  const pct = (cal: number) => macros ? Math.round(cal / macros * 100) : 0;
  return (
    <div className="eva-editor-backdrop">
      <section className="eva-editor">
        <header><button onClick={onClose}><ArrowLeft /></button><h2>食品详情</h2><button onClick={onClose}><X /></button></header>
        <div className="eva-editor-body">
          <label className="eva-food-name"><input value={form.foodName} onChange={e => setForm({ ...form, foodName: e.target.value })}/><CheckCircle2 /></label>
          <div className="eva-macro-card">
            {[
              ["热量", "千卡", form.calories, "calories"],
              ["碳水", "g", form.carbohydrate, "carbohydrate"],
              ["蛋白质", "g", form.protein, "protein"],
              ["脂肪", "g", form.fat, "fat"]
            ].map(([label, unit, value, key]) => (
              <label key={key}><input inputMode="decimal" value={value} onChange={e => setForm({ ...form, [key]: e.target.value })}/><span>{unit}</span><small>{label}</small></label>
            ))}
            <div className="eva-form-row"><span>单位</span><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}/></div>
            <div className="eva-form-row"><span>数量</span><input inputMode="decimal" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}/></div>
          </div>
          <div className="eva-source-card">
            <h3>热量来源</h3>
            <div>
              <span><i className="carb">◒</i><b>碳水</b><small>({pct(n(form.carbohydrate) * 4)}%)</small></span>
              <span><i className="protein">◉</i><b>蛋白质</b><small>({pct(n(form.protein) * 4)}%)</small></span>
              <span><i className="fat">◓</i><b>脂肪</b><small>({pct(n(form.fat) * 9)}%)</small></span>
            </div>
          </div>
        </div>
        <button className="eva-save" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/elevatine-imports/${batchId}`, {
              method: "PATCH",
              body: JSON.stringify({ items: [{
                id: item.id,
                foodName: form.foodName,
                quantity: form.quantity === "" ? null : Number(form.quantity),
                unit: form.unit || null,
                calories: Number(form.calories),
                carbohydrate: form.carbohydrate === "" ? null : Number(form.carbohydrate),
                protein: form.protein === "" ? null : Number(form.protein),
                fat: form.fat === "" ? null : Number(form.fat)
              }] })
            });
            onSaved();
          } finally { setBusy(false); }
        }}>{busy ? <LoaderCircle className="spin"/> : <Check/>}保存</button>
      </section>
    </div>
  );
}

export default function ElevatineSyncPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [editing, setEditing] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const loadHistory = () => api<{ batches: History[] }>("/api/elevatine-imports")
    .then(result => setHistory(result.batches)).catch(() => undefined);
  useEffect(() => {
    loadHistory();
    const id = new URLSearchParams(window.location.search).get("batch");
    if (id) {
      api<Batch>(`/api/elevatine-imports/${id}`).then(value => {
        setBatch(value);
        setStep(value.status === "committed" ? 4 : value.status === "review" ? 3 : 2);
      }).catch(cause => setError(cause instanceof Error ? cause.message : "批次加载失败"));
    }
  }, []);
  const refresh = async () => {
    if (!batch) return;
    setBatch(await api<Batch>(`/api/elevatine-imports/${batch.id}`));
  };
  const day = batch?.elevatine_import_day[activeDay];
  const meals = useMemo(() => {
    const result = new Map<string, Item[]>();
    for (const item of day?.elevatine_import_item || []) {
      const key = `${item.meal_order}|${item.meal_label}|${item.meal_time || ""}`;
      result.set(key, [...(result.get(key) || []), item]);
    }
    return [...result.entries()];
  }, [day]);
  const nutritionFailures = useMemo(() =>
    batch?.elevatine_import_day.reduce((total, entry) =>
      total + entry.elevatine_import_item.filter(item => item.match_status === "estimate_failed").length, 0
    ) || 0, [batch]);

  const addFiles = (incoming: File[]) => {
    const next = [...files];
    for (const file of incoming) {
      if (!next.some(existing => existing.name === file.name && existing.size === file.size)) next.push(file);
    }
    setFiles(next.slice(0, 20));
  };
  const start = async () => {
    setError("");
    if (!files.length) return setError("请至少选择一张截图");
    setStep(2);
    try {
      const form = new FormData();
      form.set("defaultYear", String(year));
      files.forEach(file => form.append("images", file));
      const created = await api<{ id: string }>("/api/elevatine-imports", { method: "POST", body: form });
      window.history.replaceState(null, "", `/sync/elevatine?batch=${created.id}`);
      const parsed = await api<Batch>(`/api/elevatine-imports/${created.id}/parse`, {
        method: "POST", body: JSON.stringify({})
      });
      setBatch(parsed);
      setStep(3);
      history.push();
      loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "同步失败");
      setStep(1);
    }
  };
  const commit = async () => {
    if (!batch) return;
    setError("");
    try {
      setBatch(await api<Batch>(`/api/elevatine-imports/${batch.id}/commit`, {
        method: "POST", body: "{}"
      }));
      setStep(4);
      loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败");
    }
  };
  const enrichNutrition = async () => {
    if (!batch) return;
    setError("");
    try {
      setBatch(await api<Batch>(`/api/elevatine-imports/${batch.id}/enrich`, {
        method: "POST", body: "{}"
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "食品营养补全失败");
    }
  };

  return (
    <div className="app-shell eva-shell">
      <AppSidebar/>
      <section className="eva-page">
      <div className="eva-topbar">
        <div className="eva-page-title"><span>AI FOOD SYNC</span><h1>AI 识别记录</h1></div>
        <div className="eva-steps">
          {["上传截图", "AI 解析", "多日审核", "完成"].map((label, index) => (
            <span key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}>
              <i>{step > index + 1 ? <Check /> : index + 1}</i>{label}
            </span>
          ))}
        </div>
      </div>

      {step === 1 && (
        <main className="eva-upload-page">
          <section className="eva-intro">
            <span><Sparkles /></span>
            <p>ELAVATINE SYNC</p>
            <h2>同步 Elavatine<br/>饮食数据</h2>
            <p className="copy">上传 Elavatine 的每日汇总和食品详情截图。AI 只负责识别，你确认后才会写入系统。</p>
            <div className="eva-facts"><span><b>20</b>张/批</span><span><b>24h</b>原图保留</span><span><b>0</b>自动入库</span></div>
          </section>
          <section className="eva-upload-card">
            <div className="eva-card-title"><span>01</span><div><b>选择截图</b><small>支持 JPEG、PNG、WebP</small></div></div>
            <button
              className={`eva-drop ${drag ? "drag" : ""}`}
              onClick={() => input.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]); }}
            >
              <ImagePlus /><b>拖入截图，或点击选择</b><span>可混合上传多个日期，每张不超过 10 MB</span>
            </button>
            <input ref={input} hidden multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={e => addFiles([...(e.target.files || [])])}/>
            {!!files.length && <div className="eva-file-grid">{files.map((file, index) => (
              <div key={`${file.name}-${index}`}><FileImage/><span><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button onClick={() => setFiles(files.filter((_, i) => i !== index))}><X/></button></div>
            ))}</div>}
            <label className="eva-year"><span>默认年份</span><input type="number" min="2000" max="2100" value={year} onChange={e => setYear(Number(e.target.value))}/><small>截图只有月日时用于补全年份</small></label>
            {error && <p className="eva-error"><AlertCircle/>{error}</p>}
            <button className="eva-primary" onClick={start}><Upload/>上传并开始解析 <span>{files.length || 0} 张</span></button>
          </section>
          {!!history.length && <section className="eva-history"><h3>最近同步</h3>{history.slice(0, 4).map(row => (
            <button key={row.id} onClick={async () => {
              const value = await api<Batch>(`/api/elevatine-imports/${row.id}`);
              window.history.replaceState(null, "", `/sync/elevatine?batch=${row.id}`);
              setBatch(value);
              setStep(value.status === "committed" ? 4 : value.status === "review" ? 3 : 2);
            }}><span className={row.status}><CheckCircle2/></span><p><b>{row.dayCount} 个日期 · {row.imageCount} 张截图</b><small>{new Date(row.createdAt).toLocaleString("zh-CN")}</small></p><em>{row.status}</em></button>
          ))}</section>}
        </main>
      )}

      {step === 2 && (
        <main className="eva-parsing">
          <div className="eva-ai-orb"><Sparkles/><i/><i/></div>
          <p>MiMo VISION</p><h2>正在理解你的饮食截图</h2>
          <span>识别日期、营养汇总、餐次和食品详情。最多同时解析 3 张。</span>
          <div className="eva-progress"><i/><b>解析中，请稍候…</b></div>
        </main>
      )}

      {step === 3 && batch && (
        <main className="eva-review">
          <section className="eva-review-main">
            <div className="eva-day-tabs">{batch.elevatine_import_day.map((entry, index) => (
              <button className={activeDay === index ? "active" : ""} key={entry.id} onClick={() => setActiveDay(index)}>
                {dateLabel(entry.record_date)}<small>{entry.calories} 千卡</small>
              </button>
            ))}</div>
            {!day ? <div className="eva-empty"><AlertCircle/><b>没有识别到每日汇总</b><span>请在右侧重试失败图片，或重新上传清晰截图。</span></div> : <>
              <div className="eva-day-heading"><div><p>DAILY SUMMARY</p><h2>{dateLabel(day.record_date)} 营养汇总</h2></div><label><input type="checkbox" checked={day.selected} onChange={async e => {
                await api(`/api/elevatine-imports/${batch.id}`, { method: "PATCH", body: JSON.stringify({ days: [{ id: day.id, selected: e.target.checked }] }) });
                refresh();
              }}/>同步此日期</label></div>
              <section className="eva-goal-card">
                <h3>营养目标 <small>汇总截图为有效数据来源</small></h3>
                <div className="eva-rings">
                  <Ring value={day.calories} goal={day.calories_goal || 0} color="#1385f5" label="热量" unit="千卡"/>
                  <Ring value={n(day.carbohydrate)} goal={n(day.carbohydrate_goal)} color="#9b44f2" label="碳水" unit="g"/>
                  <Ring value={n(day.protein)} goal={n(day.protein_goal)} color="#ffd21c" label="蛋白质" unit="g"/>
                  <Ring value={n(day.fat)} goal={n(day.fat_goal)} color="#ff7c22" label="脂肪" unit="g"/>
                </div>
              </section>
              <div className="eva-meals">{meals.map(([key, items]) => {
                const [order, label, time] = key.split("|");
                const total = items.reduce((sum, item) => sum + n(item.calories), 0);
                return <section className="eva-meal-card" key={key}>
                  <h3>{label}<small>{time && `(${time})`}</small><b>{Math.round(total)} 千卡</b></h3>
                  <div className="eva-meal-macros">
                    <span><b>{Math.round(total)}</b>热量(千卡)</span>
                    <span><b>{items.reduce((s,i)=>s+n(i.carbohydrate),0).toFixed(1)}</b>碳水(g)</span>
                    <span><b>{items.reduce((s,i)=>s+n(i.protein),0).toFixed(1)}</b>蛋白质(g)</span>
                    <span><b>{items.reduce((s,i)=>s+n(i.fat),0).toFixed(1)}</b>脂肪(g)</span>
                  </div>
                  <div className="eva-food-list">{items.map(item => <button key={item.id} onClick={() => setEditing(item)}>
                    <span><b>{item.food_name}</b><small>{item.quantity ?? "—"}{item.unit || "份"} · {item.match_status==="estimated"?"MiMo AI 估算":item.match_status==="estimate_failed"?"AI 估算失败，请手工编辑":item.carbohydrate == null?"仅汇总数据":"已匹配详情"}</small></span>
                    <strong>{Math.round(n(item.calories))} 千卡</strong><Pencil/>
                  </button>)}</div>
                </section>;
              })}</div>
              <div className="eva-diff">
                <AlertCircle/><span><b>汇总与食品明细相差 {Math.round(day.calories - day.elevatine_import_item.reduce((s,i)=>s+n(i.calories),0))} 千卡</b><small>有效热量将使用汇总截图，不会虚构食品补齐差额。</small></span>
              </div>
            </>}
            {error && <p className="eva-error"><AlertCircle/>{error}</p>}
          </section>
          <aside className="eva-image-panel">
            <h3>图片与问题 <small>{batch.elevatine_import_image.length} 张</small></h3>
            {batch.elevatine_import_image.map(image => <div className="eva-image-row" key={image.id}>
              <span className={image.status}><FileImage/></span><p><b>{image.file_name}</b><small>{image.status === "failed" ? image.error_message : `${image.image_kind === "summary" ? "每日汇总" : "食品详情"} · 置信度 ${Math.round(n(image.confidence) * 100)}%`}</small></p>
              {image.status === "failed" ? <button onClick={async () => {
                setStep(2);
                const value = await api<Batch>(`/api/elevatine-imports/${batch.id}/parse`, { method: "POST", body: JSON.stringify({ imageId: image.id }) });
                setBatch(value); setStep(3);
              }}><RefreshCw/></button> : <Check/>}
            </div>)}
            {!!batch.unmatched.length && <div className="eva-issues"><b>{batch.unmatched.length} 个食品待分配</b>{batch.unmatched.map(item => (
              <label key={item.id}><span>{item.food_name}</span><select defaultValue="" onChange={async e => {
                await api(`/api/elevatine-imports/${batch.id}`, {
                  method: "PATCH", body: JSON.stringify({ items: [{ id: item.id, dayId: e.target.value }] })
                }); refresh();
              }}><option value="">选择日期</option>{batch.elevatine_import_day.map(entry => <option value={entry.id} key={entry.id}>{dateLabel(entry.record_date)}</option>)}</select></label>
            ))}</div>}
            {!!nutritionFailures && <div className="eva-issues"><b>{nutritionFailures} 个食品待补全营养</b><small>系统会先匹配共享/私人食品库，未命中时再由 MiMo 估算。</small></div>}
            {!!nutritionFailures && <button className="eva-primary" onClick={enrichNutrition}>
              <Sparkles/>匹配食品库并重新补全
            </button>}
            <button className="eva-primary" disabled={!batch.elevatine_import_day.length || !!batch.unmatched.length || !!nutritionFailures} onClick={commit}>
              <Check/>确认并写入 FitFuel <ChevronRight/>
            </button>
          </aside>
          {editing && <FoodEditor batchId={batch.id} item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }}/>}
        </main>
      )}

      {step === 4 && batch && (
        <main className="eva-complete">
          <span><Check/></span><p>SYNC COMPLETED</p><h2>同步完成</h2>
          <div><b>{batch.elevatine_import_day.filter(day => day.selected).length}</b><small>个日期已更新</small></div>
          <p className="copy">汇总热量与宏量营养已成为有效来源；活动消耗、体重和你手工添加的餐食保持不变。</p>
          <nav><Link href="/records">查看饮食记录</Link><Link href="/stats">查看统计更新</Link></nav>
          <button className="eva-text-button" onClick={() => { setBatch(null); setFiles([]); setStep(1); }}><RotateCcw/>继续同步</button>
        </main>
      )}
      </section>
    </div>
  );
}
