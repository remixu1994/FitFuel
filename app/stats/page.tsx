"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Apple, ArrowDownRight, ArrowRight, CalendarDays, ChevronLeft, CircleGauge,
  Calculator, Download, Dumbbell, Flame, Leaf, LoaderCircle, Plus, RotateCcw, Save,
  Sparkles, Target, TrendingDown, Upload, Utensils, Weight, X, Zap
} from "lucide-react";
import { api, chinaDate } from "@/lib/client";
import { AppSidebar } from "@/components/AppSidebar";
import { ExportDrawer, ImportDrawer } from "./DataTransferDrawers";

type StatRecord={record_date:string;weight_kg:number|null;calories_consumed:number;meal_calories:number;manual_calories:number|null;imported_calories:number|null;calories_source:string;activity_calories:number;bmr:number;tef:number;tdee:number;calorie_balance:number};
type Weekly={week_start:string;theoretical_weight_change_kg:number;start_weight_kg:number|null;end_weight_kg:number|null};
type StatsData={
  records:StatRecord[];weekly:Weekly[];profile:Record<string,number>;
  summary:{
    averageIntake:number;averageActivity:number;averageTdee:number;averageBalance:number;actualTdee:number;
    currentWeight:number|null;startWeight:number|null;targetWeight:number;weeklyRate:number;estimatedDate:string|null;
    periodStart:string;periodEnd:string;periodDays:number;recordedDays:number;periodActivityTotal:number;
    dailyActivityTotal:number;periodActivitySource:"period_manual"|"daily";periodTdee:number;periodBalance:number;
  };
};
type MetricKind="weight"|"calories";

export default function StatsPage(){
  const router=useRouter();
  const [range,setRange]=useState("30d");
  const [metric,setMetric]=useState<MetricKind>("weight");
  const [data,setData]=useState<StatsData|null>(null);
  const [loading,setLoading]=useState(true);
  const [formOpen,setFormOpen]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [exportOpen,setExportOpen]=useState(false);
  const [periodOpen,setPeriodOpen]=useState(false);
  const [error,setError]=useState("");
  async function load(){
    setLoading(true);setError("");
    try{setData(await api<StatsData>(`/api/stats?range=${range}`));}
    catch(error){setError(error instanceof Error?error.message:"统计加载失败");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[range]);
  const summary=data?.summary;
  const current=Number(summary?.currentWeight??data?.profile?.initial_weight_kg??0);
  const initial=Number(summary?.startWeight??data?.profile?.initial_weight_kg??current);
  const target=Number(summary?.targetWeight??data?.profile?.target_weight_kg??current);
  const progress=initial===target?0:Math.max(0,Math.min(100,(initial-current)/(initial-target)*100));

  return <div className="stats-shell">
    <AppSidebar/>
    <main className="stats-main"><header className="stats-header"><div><p>PROGRESS ANALYTICS</p><h1>减脂统计</h1><span>基于真实记录校准你的消耗模型</span></div><div className="stats-header-actions"><button className="export" onClick={()=>setImportOpen(true)}><Upload/> 导入数据</button><button className="export" onClick={()=>setExportOpen(true)}><Download/> 导出</button><button className="add-record" onClick={()=>setFormOpen(true)}><Plus/> 记录今日数据</button></div></header>
      {error&&<div className="global-message error">{error}</div>}
      {loading?<div className="page-loading"><LoaderCircle/> 正在计算真实趋势…</div>:<div className="stats-content">
        <section className="status-overview"><div className="status-copy"><p>当前进度</p><div className="current-weight"><strong>{current||"—"}</strong><span>kg</span></div><div className="weight-change"><TrendingDown/> 较初始下降 {Math.max(0,initial-current).toFixed(1)} kg</div></div>
          <div className="target-rail"><div className="rail-labels"><span>初始 {initial||"—"} kg</span><b>目标 {target||"—"} kg</b></div><div className="rail"><i style={{width:`${progress}%`}}><em/></i></div><div className="rail-foot"><span>已完成 <b>{Math.round(progress)}%</b></span><span>还差 <b>{Math.max(0,current-target).toFixed(1)} kg</b></span></div></div>
          <div className="finish-estimate"><span>预计达到目标</span><strong>{summary?.estimatedDate??"数据积累中"}</strong><small>按当前平均热量差预测</small><button onClick={()=>router.push("/settings")}>查看目标计划 <ArrowRight/></button></div>
        </section>
        {summary&&<section className="period-activity-summary">
          <div className="period-summary-heading">
            <span className="period-summary-icon"><Calculator/></span>
            <div><p>PERIOD ACTIVE CALORIES</p><h2>周期活动消耗</h2><span>{summary.periodStart} 至 {summary.periodEnd}</span></div>
          </div>
          <div className="period-summary-stat primary"><span>Active Calories 总量</span><p><strong>{summary.periodActivityTotal.toLocaleString()}</strong> kcal</p><small>{summary.periodActivitySource==="period_manual"?"采用周期手动值":"来自每日记录合计"}</small></div>
          <div className="period-summary-stat"><span>周期 TDEE</span><p><strong>{summary.periodTdee.toLocaleString()}</strong> kcal</p><small>BMR + TEF + Active</small></div>
          <div className="period-summary-stat"><span>周期热量差</span><p className={summary.periodBalance>=0?"positive":"negative"}><strong>{Math.abs(summary.periodBalance).toLocaleString()}</strong> kcal</p><small>{summary.periodBalance>=0?"累计缺口":"累计盈余"}</small></div>
          <div className="period-summary-action"><span className={`period-source ${summary.periodActivitySource}`}>{summary.periodActivitySource==="period_manual"?"周期手动":"每日合计"}</span><small>已有 {summary.recordedDays}/{summary.periodDays} 天每日记录</small><button onClick={()=>setPeriodOpen(true)}>编辑周期总量</button></div>
        </section>}
        <section className="metric-row">
          <Metric icon={<Apple/>} label="日均摄入" value={summary?.averageIntake??0} unit="kcal" note="来自每日真实记录" tone="orange"/>
          <Metric icon={<Activity/>} label="日均活动" value={summary?.averageActivity??0} unit="kcal" note="用户录入活动消耗" tone="blue"/>
          <Metric icon={<Flame/>} label="平均 TDEE" value={summary?.averageTdee??0} unit="kcal" note="Mifflin-St Jeor" tone="green"/>
          <Metric icon={<Zap/>} label="日均热量差" value={summary?.averageBalance??0} unit="kcal" note={`约 ${(summary?.weeklyRate??0).toFixed(2)} kg/周`} tone="violet"/>
        </section>
        <section className="analytics-grid"><div className="trend-panel"><div className="panel-head"><div><p>TREND</p><h2>{metric==="weight"?"体重趋势":"热量趋势"}</h2><span>{data?.records.length?"数据来自你的每日记录":"记录数据后将在这里生成趋势"}</span></div><div className="trend-controls"><div className="metric-tabs"><button className={metric==="weight"?"active":""} onClick={()=>setMetric("weight")}>体重</button><button className={metric==="calories"?"active":""} onClick={()=>setMetric("calories")}>热量</button></div><div className="range-tabs">{["7d","30d","90d"].map(value=><button key={value} className={range===value?"active":""} onClick={()=>setRange(value)}>{value.replace("d","天")}</button>)}</div></div></div>
          <TrendChart records={data?.records??[]} metric={metric} range={range}/></div>
          <aside className="model-panel"><div className="panel-head"><div><p>ADAPTIVE MODEL</p><h2>个人消耗模型</h2><span>基于所选区间真实体重反馈</span></div><CircleGauge/></div><div className="model-gauge"><div><strong>{data?.records.length?Math.min(96,50+data.records.length*3):0}</strong><span>%</span><small>模型可信度</small></div></div>
            <div className="model-lines"><div><span>理论 TDEE</span><b>{summary?.averageTdee??0} kcal</b></div><div><span>实际 TDEE</span><b>{summary?.actualTdee??0} kcal</b></div><div className="difference"><span>模型偏差</span><b><ArrowDownRight/> {(summary?.actualTdee??0)-(summary?.averageTdee??0)} kcal</b></div></div>
            <div className="model-note"><Sparkles/><span>{(data?.records.length??0)<7?"至少记录 7 天后，模型会给出更可靠的调整建议。":"模型已根据你的真实体重变化完成本区间校准。"}</span></div>
          </aside></section>
        <section className="lower-grid"><div className="weekly-panel"><div className="panel-head"><div><p>WEEKLY VELOCITY</p><h2>每周减脂速度</h2></div></div><div className="week-bars">{(data?.weekly??[]).slice(0,6).reverse().map((week,index)=>{const change=week.start_weight_kg&&week.end_weight_kg?Number(week.start_weight_kg)-Number(week.end_weight_kg):Number(week.theoretical_weight_change_kg);return <div key={week.week_start}><span><i style={{height:`${Math.min(100,Math.max(5,change/.7*100))}%`}}/></span><b>-{Math.max(0,change).toFixed(2)} kg</b><small>W{index+1}</small></div>})}</div><div className="speed-note"><span>健康减脂区间</span><i/><small>0.4–0.7 kg/周</small></div></div>
          <div className="records-panel"><div className="panel-head"><div><p>RECENT LOGS</p><h2>最近记录</h2></div><button onClick={()=>setFormOpen(true)}><Plus/> 新增</button></div><div className="record-table"><div className="table-head"><span>日期</span><span>体重</span><span>摄入</span><span>活动</span><span>热量差</span></div>{(data?.records??[]).slice(-5).reverse().map(record=><div className="table-row" key={record.record_date}><span>{displayDate(record.record_date)}</span><b>{record.weight_kg??"—"} kg</b><span className="intake-source">{record.calories_consumed}<small>{sourceLabel(record.calories_source)}</small></span><span>{record.activity_calories}</span><strong>{record.calorie_balance>=0?"-":"+"}{Math.abs(Math.round(record.calorie_balance))} kcal</strong></div>)}</div></div>
        </section>
      </div>}
    </main>
    {formOpen&&<RecordDrawer latestWeight={current||Number(data?.profile?.initial_weight_kg??70)} onClose={()=>setFormOpen(false)} onSaved={async()=>{setFormOpen(false);await load();}}/>}
    {importOpen&&<ImportDrawer onClose={()=>setImportOpen(false)} onImported={load}/>}
    {exportOpen&&<ExportDrawer currentRange={range} onClose={()=>setExportOpen(false)}/>}
    {periodOpen&&summary&&<PeriodActivityModal summary={summary} onClose={()=>setPeriodOpen(false)} onSaved={async()=>{setPeriodOpen(false);await load();}}/>}
  </div>;
}

function PeriodActivityModal({
  summary,onClose,onSaved
}:{
  summary:StatsData["summary"];onClose:()=>void;onSaved:()=>Promise<void>;
}){
  const [total,setTotal]=useState(String(summary.periodActivityTotal));
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    window.addEventListener("keydown",close);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);};
  },[onClose]);
  async function save(){
    const value=Number(total);
    if(!Number.isFinite(value)||value<0){setError("请输入有效的周期 Active Calories 总量");return;}
    setSaving(true);setError("");
    try{
      await api("/api/activity-periods",{
        method:"PUT",
        body:JSON.stringify({
          startDate:summary.periodStart,endDate:summary.periodEnd,
          activeCaloriesTotal:value,note
        })
      });
      await onSaved();
    }catch(error){setError(error instanceof Error?error.message:"保存失败");}
    finally{setSaving(false);}
  }
  async function restoreDaily(){
    setSaving(true);setError("");
    try{
      const query=new URLSearchParams({startDate:summary.periodStart,endDate:summary.periodEnd});
      await api(`/api/activity-periods?${query}`,{method:"DELETE"});
      await onSaved();
    }catch(error){setError(error instanceof Error?error.message:"恢复失败");}
    finally{setSaving(false);}
  }
  return <div className="record-backdrop period-activity-backdrop" onMouseDown={onClose}>
    <section className="period-activity-modal" role="dialog" aria-modal="true" aria-labelledby="period-activity-title" onMouseDown={event=>event.stopPropagation()}>
      <div className="drawer-head"><div><p>PERIOD ACTIVE CALORIES</p><h2 id="period-activity-title">录入周期活动消耗</h2><span>用于所选周期汇总，不会拆分或覆盖每日记录</span></div><button onClick={onClose} aria-label="关闭"><X/></button></div>
      {error&&<div className="form-error">{error}</div>}
      <div className="period-date-range"><div><small>开始日期</small><b>{summary.periodStart}</b></div><ArrowRight/><div><small>结束日期</small><b>{summary.periodEnd}</b></div></div>
      <label className="period-total-input"><span>周期 Active Calories 总量</span><div><Activity/><input autoFocus type="number" min="0" max="1000000" step="1" value={total} onChange={event=>setTotal(event.target.value)}/><b>kcal</b></div></label>
      <label className="period-note-input"><span>备注（可选）</span><textarea value={note} maxLength={500} onChange={event=>setNote(event.target.value)} placeholder="例如：来自 COROS 月度活动消耗汇总"/></label>
      <div className="period-calculation-note"><Calculator/><div><b>汇总口径</b><span>周期 TDEE = 已有每日 BMR + 已有每日 TEF + 周期 Active Calories。每日趋势仍使用每天单独录入的数据。</span></div></div>
      <div className="period-modal-actions">
        {summary.periodActivitySource==="period_manual"&&<button className="restore-daily" disabled={saving} onClick={restoreDaily}><RotateCcw/> 恢复每日合计</button>}
        <button className="save-period" disabled={saving} onClick={save}><Save/> {saving?"正在保存…":"保存周期总量"}</button>
      </div>
    </section>
  </div>;
}

function Metric({icon,label,value,unit,note,tone}:{icon:React.ReactNode;label:string;value:number;unit:string;note:string;tone:string}){return <div className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><p><strong>{Math.round(value).toLocaleString()}</strong> {unit}</p><em>{note}</em></div></div>}
function sourceLabel(source:string){return {meals:"餐食",manual:"手工",import:"导入"}[source]??source}
function displayDate(value:string){return value.slice(0,10).slice(5);}
function chartTickIndexes(total:number,range:string){
  if(total<=0)return new Set<number>();
  const maximum=range==="7d"?7:range==="30d"?5:7;
  if(total<=maximum)return new Set(Array.from({length:total},(_,index)=>index));
  return new Set(Array.from({length:maximum},(_,index)=>Math.round(index*(total-1)/(maximum-1))));
}

function TrendChart({records,metric,range}:{records:StatRecord[];metric:MetricKind;range:string}){
  if(!records.length)return <div className="chart-empty"><TrendingDown/><b>暂无趋势数据</b><span>点击“记录今日数据”建立第一条记录</span></div>;
  const width=760,height=240,padX=36,padY=24,count=Math.max(1,records.length-1);
  if(metric==="weight"){
    const valid=records.filter(record=>record.weight_kg);
    if(!valid.length)return <div className="chart-empty"><Weight/><b>暂无体重记录</b></div>;
    const min=Math.min(...valid.map(r=>Number(r.weight_kg)))-.3,max=Math.max(...valid.map(r=>Number(r.weight_kg)))+.3,span=Math.max(.1,max-min);
    const points=valid.map((r,i)=>({x:padX+i*(width-padX*2)/Math.max(1,valid.length-1),y:padY+(max-Number(r.weight_kg))/span*(height-padY*2)}));
    const ticks=chartTickIndexes(valid.length,range);
    const path=points.map((p,i)=>`${i?"L":"M"}${p.x},${p.y}`).join(" ");
    const area=`${path} L${points.at(-1)?.x},${height-padY} L${points[0].x},${height-padY} Z`;
    return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`}><defs><linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#27ad68" stopOpacity=".22"/><stop offset="1" stopColor="#27ad68" stopOpacity="0"/></linearGradient></defs>{[0,1,2,3].map(i=><line key={i} x1={padX} x2={width-padX} y1={padY+i*(height-padY*2)/3} y2={padY+i*(height-padY*2)/3} stroke="#edf1ef" strokeDasharray="4 5"/>)}<path d={area} fill="url(#weightArea)"/><path d={path} fill="none" stroke="#18a85d" strokeWidth="3"/>{points.map((point,index)=><g key={index}><circle cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#18a85d" strokeWidth="2"/>{ticks.has(index)&&<text x={point.x} y={height-5} textAnchor="middle">{displayDate(valid[index].record_date)}</text>}</g>)}</svg></div>;
  }
  const max=Math.max(3000,...records.map(r=>Math.max(r.calories_consumed,r.tdee)));
  const ticks=chartTickIndexes(records.length,range);
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`}>{[0,1,2,3].map(i=><line key={i} x1={padX} x2={width-padX} y1={padY+i*(height-padY*2)/3} y2={padY+i*(height-padY*2)/3} stroke="#edf1ef" strokeDasharray="4 5"/>)}{records.map((r,i)=>{const x=padX+i*(width-padX*2)/count;return <g key={r.record_date}><rect x={x-9} y={height-padY-r.calories_consumed/max*(height-padY*2)} width="8" height={r.calories_consumed/max*(height-padY*2)} rx="3" fill="#f3a05e"/><rect x={x+2} y={height-padY-r.tdee/max*(height-padY*2)} width="8" height={r.tdee/max*(height-padY*2)} rx="3" fill="#28ae69"/>{ticks.has(i)&&<text x={x} y={height-5} textAnchor="middle">{displayDate(r.record_date)}</text>}</g>})}</svg><div className="chart-legend"><span><i style={{background:"#f3a05e"}}/>摄入</span><span><i style={{background:"#28ae69"}}/>TDEE</span></div></div>;
}

function RecordDrawer({latestWeight,onClose,onSaved}:{latestWeight:number;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [weight,setWeight]=useState(latestWeight);const [intake,setIntake]=useState(0);const [activity,setActivity]=useState(0);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const bmr=10*weight+6.25*175-5*32+5,tef=intake*.08,tdee=bmr+activity+tef,deficit=tdee-intake;
  async function save(){setSaving(true);setError("");try{await api(`/api/daily-records/${chinaDate()}`,{method:"PUT",body:JSON.stringify({weight,caloriesConsumed:intake,activityCalories:activity})});await onSaved();}catch(error){setError(error instanceof Error?error.message:"保存失败");}finally{setSaving(false);}}
  return <div className="record-backdrop" onMouseDown={onClose}><aside className="record-drawer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><p>DAILY CHECK-IN</p><h2>记录今日数据</h2><span>计算在服务端复核后保存</span></div><button onClick={onClose}><X/></button></div>{error&&<div className="form-error">{error}</div>}<label>日期<div><CalendarDays/><input value={chinaDate()} readOnly/></div></label><label>今日体重<div><Weight/><input type="number" step=".1" value={weight} onChange={e=>setWeight(+e.target.value)}/><span>kg</span></div></label><label>摄入热量<div><Utensils/><input type="number" value={intake} onChange={e=>setIntake(+e.target.value)}/><span>kcal</span></div></label><label>活动消耗<div><Activity/><input type="number" value={activity} onChange={e=>setActivity(+e.target.value)}/><span>kcal</span></div></label><div className="calculation"><p>预估结果</p><div><span>基础代谢<b>{Math.round(bmr)} kcal</b></span><span>食物热效应<b>{Math.round(tef)} kcal</b></span><span>总消耗<b>{Math.round(tdee)} kcal</b></span><span className="deficit">热量差<b>{Math.round(deficit)} kcal</b></span></div></div><button className="save-record" disabled={saving} onClick={save}>{saving?"正在保存…":"保存今日记录"} <ArrowRight/></button></aside></div>;
}
