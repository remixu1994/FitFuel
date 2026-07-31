"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, BarChart3, CalendarDays, CheckCircle2, ClipboardList, Clock3, Dumbbell,
  Flame, Heart, Leaf, LoaderCircle, LogOut, Menu, RefreshCw, ScanLine, Settings,
  ShieldCheck, TrendingUp, X, Zap, Plus, ArrowRight, ChevronLeft, ChevronRight, Pencil
} from "lucide-react";
import { api } from "@/lib/client";
import { AppSidebar } from "@/components/AppSidebar";
import styles from "./activity.module.css";

type User = { id:number; email:string; displayName:string; role:string };
type Day = { date:string; activityCount:number; caloriesKcal:number };
type CalendarDay = {
  date:string;activityCalories:number;corosActivityCalories:number|null;source:string;tdee:number;
};
type ActivityData = {
  range:string; startDate:string; endDate:string; canSync:boolean;
  connection:{configured:boolean;lastSyncAt:string|null;lastBatchActivityCount:number};
  summary:{
    totalCalories:number;activeDays:number;activityCount:number;averagePerActiveDay:number;
    peak:{date:string|null;calories:number};
  };
  energy:{
    recordedDays:number;periodDays:number;
    averages:{bmr:number;tef:number;activeCalories:number;tdee:number;intake:number;deficit:number};
    totals:{bmr:number;tef:number;activeCalories:number;tdee:number;intake:number;deficit:number};
    activitySources:Record<string,number>;
  };
  calendar:{month:string;days:CalendarDay[]};
  days:Day[];
};

const nav = [
  [CalendarDays,"今日饮食","/"],
  [ClipboardList,"饮食记录","/records"],
  [Dumbbell,"运动消耗","/activity"],
  [ScanLine,"AI 识别记录","/sync/elevatine"],
  [BarChart3,"营养分析","/stats"],
  [ClipboardList,"报告统计","/stats"],
  [Heart,"我的收藏","#"],
  [Settings,"设置","/settings"]
] as const;

const rangeOptions = [["7d","7 天"],["30d","30 天"],["90d","90 天"],["2026","2026 年"]] as const;

export default function ActivityPage() {
  const router = useRouter();
  const [range,setRange] = useState("30d");
  const [data,setData] = useState<ActivityData|null>(null);
  const [user,setUser] = useState<User|null>(null);
  const [loading,setLoading] = useState(true);
  const [syncing,setSyncing] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [menuOpen,setMenuOpen] = useState(false);
  const [manualOpen,setManualOpen] = useState(false);
  const [manualDate,setManualDate] = useState(chinaDate());
  const [calendarMonth,setCalendarMonth] = useState(chinaDate().slice(0,7));
  const [customStart,setCustomStart] = useState(`${chinaDate().slice(0,7)}-01`);
  const [customEnd,setCustomEnd] = useState(chinaDate());
  const [appliedCustom,setAppliedCustom] = useState<{start:string;end:string}|null>(null);
  const hasLoaded=useRef(false);

  const load = useCallback(async()=>{
    if(!hasLoaded.current)setLoading(true);
    setError("");
    try{
      const periodQuery=appliedCustom
        ? `startDate=${appliedCustom.start}&endDate=${appliedCustom.end}`
        : `range=${range}`;
      const [activityData,session] = await Promise.all([
        api<ActivityData>(`/api/coros/activities?${periodQuery}&month=${calendarMonth}`),
        api<{user:User}>("/api/auth/session")
      ]);
      setData(activityData);setUser(session.user);
    }catch(error){
      setError(error instanceof Error?error.message:"运动数据加载失败");
    }finally{hasLoaded.current=true;setLoading(false);}
  },[range,calendarMonth,appliedCustom]);

  useEffect(()=>{void load();},[load]);

  async function sync(){
    setSyncing(true);setError("");setMessage("");
    try{
      const result=await api<{activityCount:number;dayCount:number}>("/api/coros/sync",{
        method:"POST",
        body:JSON.stringify({startDate:"2026-01-01",endDate:"2026-12-31"})
      });
      setMessage(`同步完成：${result.activityCount} 条活动，覆盖 ${result.dayCount} 个运动日`);
      await load();
    }catch(error){
      setError(error instanceof Error?error.message:"COROS 同步失败");
    }finally{setSyncing(false);}
  }

  async function logout(){
    await api("/api/auth/logout",{method:"POST"}).catch(()=>undefined);
    router.replace("/login");
  }

  function applyCustomRange(){
    if(!customStart||!customEnd){setError("请选择完整的开始和结束日期");return;}
    if(customStart>customEnd){setError("开始日期不能晚于结束日期");return;}
    setError("");
    setAppliedCustom({start:customStart,end:customEnd});
  }

  function choosePreset(value:string){
    setAppliedCustom(null);
    setRange(value);
  }

  return <div className={`app-shell ${styles.shell}`}>
    <AppSidebar user={user}/>

    <main className={styles.main}>
      <header className={styles.header}>
        <div><p>SPORT ACTIVITY</p><h1>运动消耗</h1><span>COROS 记录运动，手动补充全天 Active Calories，并统一进入每日能量模型</span></div>
        <div className={styles.actions}>
          <div className={styles.connection}><i className={data?.connection.configured?styles.online:""}/><span><b>{data?.connection.configured?"COROS 已连接":"COROS 未配置"}</b><small>{data?.connection.lastSyncAt?`更新于 ${formatDateTime(data.connection.lastSyncAt)}`:"尚未同步"}</small></span></div>
          {data?.canSync&&<button className={styles.syncButton} onClick={sync} disabled={syncing}>{syncing?<LoaderCircle className={styles.spin}/>:<RefreshCw/>}{syncing?"正在同步":"同步 COROS"}</button>}
          <button className={styles.manualButton} onClick={()=>{setManualDate(chinaDate());setManualOpen(true);}}><Plus/>录入全天活动</button>
        </div>
      </header>

      <div className={styles.content}>
        {error&&<div className={`${styles.notice} ${styles.error}`}>{error}<button onClick={()=>setError("")}><X/></button></div>}
        {message&&<div className={styles.notice}><CheckCircle2/>{message}</div>}
        <div className={styles.toolbar}>
          <div><span>统计范围</span><b>{formatRangeDate(data?.startDate)} — {formatRangeDate(data?.endDate)}</b></div>
          <div className={styles.rangeControls}>
            <div className={styles.presets}>{rangeOptions.map(([value,label])=><button key={value} className={!appliedCustom&&range===value?styles.active:""} onClick={()=>choosePreset(value)}>{label}</button>)}</div>
            <div className={`${styles.customDates} ${appliedCustom?styles.customActive:""}`}>
              <CalendarDays/><input aria-label="开始日期" type="date" value={customStart} onChange={event=>setCustomStart(event.target.value)}/>
              <span>至</span>
              <input aria-label="结束日期" type="date" value={customEnd} onChange={event=>setCustomEnd(event.target.value)}/>
              <button onClick={applyCustomRange}>应用</button>
            </div>
          </div>
        </div>

        {loading?<div className={styles.loading}><LoaderCircle className={styles.spin}/><b>正在读取运动数据</b><span>汇总活动热量并校验每日记录…</span></div>:data&&<>
          <section className={styles.metrics}>
            <Metric icon={<Flame/>} label="运动总消耗" value={data.summary.totalCalories} unit="kcal" note={`${data.startDate.slice(5)} 至 ${data.endDate.slice(5)}`}/>
            <Metric icon={<CalendarDays/>} label="运动天数" value={data.summary.activeDays} unit="天" note={`覆盖 ${rangeLabel(data.range)}`}/>
            <Metric icon={<Activity/>} label="活动次数" value={data.summary.activityCount} unit="次" note="已去重的 COROS 活动"/>
            <Metric icon={<TrendingUp/>} label="运动日均" value={data.summary.averagePerActiveDay} unit="kcal" note={data.summary.peak.date?`峰值 ${formatDate(data.summary.peak.date)} · ${Math.round(data.summary.peak.calories)} kcal`:"暂无峰值"}/>
          </section>

          <ActivityCalendar
            month={data.calendar.month}
            days={data.calendar.days}
            onMonthChange={setCalendarMonth}
            onEdit={date=>{setManualDate(date);setManualOpen(true);}}
          />

          <section className={styles.energyModel}>
            <div className={styles.energyIntro}>
              <div>
                <p>DAILY ENERGY ENGINE</p>
                <h2>个人能量指标</h2>
                <span>当前周期已有 {data.energy.recordedDays} 天完整记录，以下为每日平均值</span>
              </div>
              <div className={styles.energyCoverage}>
                <span>{data.energy.recordedDays}/{data.energy.periodDays}</span>
                <small>数据覆盖天数</small>
              </div>
            </div>
            <div className={styles.energyEquation}>
              <EnergyValue label="基础代谢" code="BMR" value={data.energy.averages.bmr}/>
              <span className={styles.energyOperator}>＋</span>
              <EnergyValue label="有效活动消耗" code="ACTIVE" value={data.energy.averages.activeCalories}/>
              <span className={styles.energyOperator}>＋</span>
              <EnergyValue label="食物热效应" code="TEF" value={data.energy.averages.tef}/>
              <span className={styles.energyOperator}>＝</span>
              <EnergyValue label="总能量消耗" code="TDEE" value={data.energy.averages.tdee} result/>
              <span className={styles.energyOperator}>−</span>
              <EnergyValue
                label={data.energy.averages.deficit >= 0 ? "热量缺口" : "热量盈余"}
                code={`摄入 ${Math.round(data.energy.averages.intake).toLocaleString()} kcal`}
                value={Math.abs(data.energy.averages.deficit)}
                balance
              />
            </div>
            <div className={styles.energyFoot}>
              <span><i/>周期总消耗 {Math.round(data.energy.totals.tdee).toLocaleString()} kcal</span>
              <span>周期{data.energy.totals.deficit >= 0 ? "热量缺口" : "热量盈余"} {Math.abs(Math.round(data.energy.totals.deficit)).toLocaleString()} kcal</span>
              <em>COROS 运动热量是 Active Calories 的组成部分，不直接等于 TDEE。</em>
            </div>
          </section>

          <section className={styles.trend}>
            <div className={styles.sectionHead}><div><p>DAILY BURN</p><h2>每日运动消耗</h2><span>活动列表中的热量按自然日合计，单位已换算为 kcal</span></div><div className={styles.legend}><i/>每日消耗</div></div>
            <BurnChart days={data.days}/>
          </section>

        </>}
      </div>
    </main>
    {manualOpen&&<ManualActivityModal
      initialDate={manualDate}
      onClose={()=>setManualOpen(false)}
      onSaved={async result=>{
        setMessage(`${result.date.slice(5).replace("-","/")} 全天活动消耗已更新为 ${Math.round(result.activityCalories)} kcal，TDEE 已重新计算`);
        setManualOpen(false);
        await load();
      }}
    />}
  </div>;
}

function Metric({icon,label,value,unit,note}:{icon:React.ReactNode;label:string;value:number;unit:string;note:string}){
  return <div className={styles.metric}><span>{icon}</span><div><small>{label}</small><p><b>{Math.round(value).toLocaleString()}</b> {unit}</p><em>{note}</em></div></div>;
}

function EnergyValue({label,code,value,result=false,balance=false}:{label:string;code:string;value:number;result?:boolean;balance?:boolean}){
  return <div className={`${styles.energyValue} ${result?styles.energyResult:""} ${balance?styles.energyBalance:""}`}>
    <span>{label}</span>
    <strong>{Math.round(value).toLocaleString()}<small> kcal</small></strong>
    <em>{code}</em>
  </div>;
}

const weekdays=["一","二","三","四","五","六","日"];

function ActivityCalendar({month,days,onMonthChange,onEdit}:{month:string;days:CalendarDay[];onMonthChange:(month:string)=>void;onEdit:(date:string)=>void}){
  const [year,monthNumber]=month.split("-").map(Number);
  const firstDay=new Date(Date.UTC(year,monthNumber-1,1));
  const daysInMonth=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  const leading=(firstDay.getUTCDay()+6)%7;
  const byDate=new Map(days.map(day=>[day.date,day]));
  const cells:Array<{date:string;day:number;record:CalendarDay|null}|null>=Array.from({length:leading},()=>null);
  for(let day=1;day<=daysInMonth;day+=1){
    const date=`${month}-${String(day).padStart(2,"0")}`;
    cells.push({date,day,record:byDate.get(date)??null});
  }
  while(cells.length%7)cells.push(null);
  const today=chinaDate();
  const currentMonth=today.slice(0,7);
  const previous=shiftMonth(month,-1);
  const next=shiftMonth(month,1);
  return <section className={styles.calendarSection}>
    <div className={styles.calendarHead}>
      <div><p>ACTIVE CALENDAR</p><h2>每日活动消耗</h2><span>快速预览全天 Active Calories，点击日期即可编辑</span></div>
      <div className={styles.monthSwitch}>
        <button aria-label="上个月" disabled={month<="2026-01"} onClick={()=>onMonthChange(previous)}><ChevronLeft/></button>
        <strong>{year} 年 {monthNumber} 月</strong>
        <button aria-label="下个月" disabled={month>=currentMonth} onClick={()=>onMonthChange(next)}><ChevronRight/></button>
      </div>
    </div>
    <div className={styles.weekdays}>{weekdays.map(day=><span key={day}>周{day}</span>)}</div>
    <div className={styles.calendarGrid}>{cells.map((cell,index)=>cell?<button
      key={cell.date}
      className={`${styles.calendarDay} ${cell.record?styles.recorded:""} ${cell.date===today?styles.today:""}`}
      disabled={cell.date>today}
      onClick={()=>onEdit(cell.date)}
      aria-label={`${cell.date} ${cell.record?`${Math.round(cell.record.activityCalories)} 千卡`:"未记录"}，点击编辑`}
    >
      <span className={styles.dayNumber}>{cell.day}{cell.date===today&&<em>今天</em>}</span>
      {cell.record?<><strong>{Math.round(cell.record.activityCalories)}<small> kcal</small></strong><span className={`${styles.sourceTag} ${styles[`source_${cell.record.source}`]??""}`}><i/>{activitySourceLabel(cell.record.source)}</span>{cell.record.corosActivityCalories!==null&&cell.record.source!=="coros"&&<small className={styles.corosReference}>COROS {Math.round(cell.record.corosActivityCalories)}</small>}</>:<><strong className={styles.emptyValue}>—</strong><span className={styles.addHint}><Plus/>录入</span></>}
      <Pencil className={styles.editIcon}/>
    </button>:<span className={styles.calendarBlank} key={`blank-${index}`}/>)}</div>
    <div className={styles.calendarLegend}><span><i className={styles.manualDot}/>手动全天活动</span><span><i className={styles.corosDot}/>COROS 运动</span><span><i className={styles.emptyDot}/>未记录</span></div>
  </section>;
}

type ManualActivityResult = {
  date:string;activityCalories:number;corosActivityCalories:number|null;activitySource:string;
  bmr:number;tef:number;tdee:number;calorieBalance:number;
};

function ManualActivityModal({initialDate,onClose,onSaved}:{initialDate:string;onClose:()=>void;onSaved:(result:ManualActivityResult)=>Promise<void>}){
  const [date,setDate]=useState(initialDate);
  const [calories,setCalories]=useState("");
  const [corosCalories,setCorosCalories]=useState<number|null>(null);
  const [currentSource,setCurrentSource]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    window.addEventListener("keydown",close);
    return()=>window.removeEventListener("keydown",close);
  },[onClose]);

  useEffect(()=>{
    let active=true;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
      setLoading(false);
      return()=>{active=false;};
    }
    setLoading(true);setError("");
    void api<{record:null|{activity_calories:number;coros_activity_calories:number|null;activity_source:string}}>(`/api/daily-records/${date}`)
      .then(result=>{
        if(!active)return;
        setCalories(result.record?String(Math.round(Number(result.record.activity_calories))):"");
        setCorosCalories(result.record?.coros_activity_calories===null||result.record?.coros_activity_calories===undefined?null:Number(result.record.coros_activity_calories));
        setCurrentSource(result.record?.activity_source??"");
      })
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"无法读取当天记录");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[date]);

  async function save(){
    const value=Number(calories);
    if(!Number.isFinite(value)||value<0){setError("请输入有效的全天活动消耗");return;}
    setSaving(true);setError("");
    try{
      const result=await api<ManualActivityResult>(`/api/daily-records/${date}/activity`,{
        method:"PATCH",
        body:JSON.stringify({activityCalories:value})
      });
      await onSaved(result);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"保存失败");
    }finally{setSaving(false);}
  }

  return <div className={styles.modalBackdrop} onMouseDown={onClose}>
    <section className={styles.manualModal} role="dialog" aria-modal="true" aria-labelledby="manual-activity-title" onMouseDown={event=>event.stopPropagation()}>
      <div className={styles.modalHead}>
        <div><p>ACTIVE CALORIES</p><h2 id="manual-activity-title">录入全天活动消耗</h2><span>记录 COROS 运动之外的全天非基础消耗</span></div>
        <button aria-label="关闭" onClick={onClose}><X/></button>
      </div>
      {error&&<div className={styles.modalError}>{error}</div>}
      <label className={styles.modalField}><span>日期</span><div><CalendarDays/><input type="date" max={chinaDate()} value={date} onChange={event=>setDate(event.target.value)}/></div></label>
      <label className={styles.modalField}><span>全天 Active Calories</span><div className={styles.calorieInput}><Activity/><input autoFocus type="number" min="0" step="1" placeholder="例如 930" value={calories} disabled={loading} onChange={event=>setCalories(event.target.value)}/><em>kcal</em></div><small>包含日常活动和运动产生的额外消耗，不包含 BMR 与 TEF。</small></label>
      <div className={styles.sourceCompare}>
        <div><span>COROS 运动消耗</span><strong>{corosCalories===null?"暂无":`${Math.round(corosCalories)} kcal`}</strong></div>
        <div><span>当前统计来源</span><strong>{currentSource?activitySourceLabel(currentSource):"尚未记录"}</strong></div>
      </div>
      <div className={styles.modalNote}><Zap/><span>保存后将以手动值作为当天有效活动消耗，并立即重算 BMR、TEF、TDEE 和热量差；以后同步 COROS 不会覆盖该值。</span></div>
      <button className={styles.saveManual} disabled={saving||loading} onClick={save}>{saving?"正在保存…":"保存全天活动消耗"}<ArrowRight/></button>
    </section>
  </div>;
}

function BurnChart({days}:{days:Day[]}){
  const [hovered,setHovered]=useState<number|null>(null);
  if(!days.length)return <div className={styles.chartEmpty}><Zap/><b>暂无消耗趋势</b><span>选择其他时间范围或先同步 COROS。</span></div>;
  const width=1000,height=270,padX=44,padTop=20,padBottom=38;
  const max=Math.max(100,...days.map(day=>day.caloriesKcal));
  const points=days.map((day,index)=>({
    x:days.length===1?width/2:padX+index*(width-padX*2)/(days.length-1),
    y:padTop+(max-day.caloriesKcal)/max*(height-padTop-padBottom)
  }));
  const path=points.map((point,index)=>`${index?"L":"M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area=`${path} L${points.at(-1)?.x},${height-padBottom} L${points[0].x},${height-padBottom} Z`;
  const labelStep=Math.max(1,Math.ceil(days.length/7));
  const hitWidth=(width-padX*2)/Math.max(1,days.length-1);
  const tooltipWidth=176,tooltipHeight=56;
  const hoveredPoint=hovered===null?null:points[hovered];
  const tooltipX=hoveredPoint===null?0:Math.min(width-tooltipWidth/2-8,Math.max(tooltipWidth/2+8,hoveredPoint.x));
  const tooltipBelow=hoveredPoint!==null&&hoveredPoint.y<padTop+tooltipHeight+16;
  const tooltipY=hoveredPoint===null?0:(tooltipBelow?hoveredPoint.y+15:hoveredPoint.y-tooltipHeight-15);
  return <div className={styles.chart}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每日运动消耗趋势">
      <defs><linearGradient id="burnArea" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#16a65d" stopOpacity=".22"/><stop offset="1" stopColor="#16a65d" stopOpacity="0"/></linearGradient></defs>
      {[0,1,2,3].map(index=><line key={index} x1={padX} x2={width-padX} y1={padTop+index*(height-padTop-padBottom)/3} y2={padTop+index*(height-padTop-padBottom)/3} stroke="#e7eeea" strokeDasharray="4 7"/>)}
      <path d={area} fill="url(#burnArea)"/><path d={path} fill="none" stroke="#16a65d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point,index)=><g key={days[index].date} onMouseEnter={()=>setHovered(index)} onMouseLeave={()=>setHovered(null)} className={styles.point}>
        <rect x={Math.max(padX,point.x-hitWidth/2)} y={padTop} width={Math.min(width-padX,point.x+hitWidth/2)-Math.max(padX,point.x-hitWidth/2)} height={height-padTop-padBottom}/>
        <circle cx={point.x} cy={point.y} r={hovered===index?7:4} fill="#fff" stroke="#16a65d" strokeWidth="3"/>
        {(index%labelStep===0||index===days.length-1)&&<text x={point.x} y={height-9} textAnchor="middle">{days[index].date.slice(5)}</text>}
      </g>)}
      {hovered!==null&&hoveredPoint&&<g className={styles.tooltipSvg} transform={`translate(${tooltipX-tooltipWidth/2} ${tooltipY})`}>
        <rect width={tooltipWidth} height={tooltipHeight} rx="10"/>
        <text x="13" y="19" className={styles.tooltipDate}>{formatDate(days[hovered].date)} · {days[hovered].activityCount} 次活动</text>
        <text x="13" y="43" className={styles.tooltipValue}>{days[hovered].caloriesKcal.toFixed(2)}<tspan> kcal</tspan></text>
        <path d={tooltipBelow?`M ${tooltipWidth/2-7} 0 L ${tooltipWidth/2} -7 L ${tooltipWidth/2+7} 0 Z`:`M ${tooltipWidth/2-7} ${tooltipHeight} L ${tooltipWidth/2} ${tooltipHeight+7} L ${tooltipWidth/2+7} ${tooltipHeight} Z`}/>
      </g>}
    </svg>
  </div>;
}

function formatDate(value?:string|null){return value?value.slice(5).replace("-","/"):"—";}
function rangeLabel(value:string){return value==="custom"?"自定义区间":rangeOptions.find(item=>item[0]===value)?.[1]??value;}
function formatDateTime(value:string){return new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}
function formatWeekday(value:string){return new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",weekday:"long",month:"long",day:"numeric"}).format(new Date(`${value}T12:00:00+08:00`));}
function formatTime(value:string|null){return value?new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"时间未记录";}
function formatDuration(seconds:number){const minutes=Math.round(seconds/60);return minutes>=60?`${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟`:`${minutes} 分钟`;}
function chinaDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function activitySourceLabel(source:string){return source==="manual"?"手动全天活动":source==="coros"?"COROS 运动":source==="import"?"文件导入":source;}
function shiftMonth(month:string,offset:number){const [year,value]=month.split("-").map(Number);const date=new Date(Date.UTC(year,value-1+offset,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;}
function formatRangeDate(value?:string|null){return value?value.replaceAll("-","/"):"—";}
