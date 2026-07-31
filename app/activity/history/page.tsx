"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3, Dumbbell,
  Flame, LoaderCircle, RotateCcw, Search
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { api } from "@/lib/client";
import styles from "./history.module.css";

type SportActivity = {
  id:string;date:string;name:string;startTime:string|null;
  durationSeconds:number|null;caloriesKcal:number;
};

type HistoryData = {
  startDate:string;endDate:string;
  summary:{activityCount:number;totalCalories:number;totalDurationSeconds:number};
  pagination:{page:number;pageSize:number;total:number;totalPages:number};
  activities:SportActivity[];
};

export default function ActivityHistoryPage(){
  const [data,setData]=useState<HistoryData|null>(null);
  const [page,setPage]=useState(1);
  const [draftStart,setDraftStart]=useState(`${chinaDate().slice(0,7)}-01`);
  const [draftEnd,setDraftEnd]=useState(chinaDate());
  const [filter,setFilter]=useState<{start:string;end:string}|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const range=filter?`&startDate=${filter.start}&endDate=${filter.end}`:"";
      setData(await api<HistoryData>(`/api/coros/activities/history?page=${page}&pageSize=10${range}`));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"运动记录加载失败");
    }finally{setLoading(false);}
  },[page,filter]);

  useEffect(()=>{void load();},[load]);

  const grouped=useMemo(()=>{
    const groups=new Map<string,SportActivity[]>();
    for(const activity of data?.activities??[]){
      const list=groups.get(activity.date)??[];
      list.push(activity);groups.set(activity.date,list);
    }
    return [...groups.entries()];
  },[data]);

  function applyFilter(){
    if(!draftStart||!draftEnd){setError("请选择完整的开始和结束日期");return;}
    if(draftStart>draftEnd){setError("开始日期不能晚于结束日期");return;}
    setPage(1);setFilter({start:draftStart,end:draftEnd});
  }

  function resetFilter(){setPage(1);setFilter(null);}

  return <div className={styles.shell}>
    <AppSidebar/>
    <main className={styles.main}>
      <header className={styles.header}>
        <div><p>ACTIVITY LOG</p><h1>运动记录</h1><span>浏览 COROS 原始运动明细，支持时间筛选与分页</span></div>
      </header>
      <div className={styles.content}>
        <section className={styles.filterBar}>
          <div><span>记录范围</span><strong>{displayDate(data?.startDate)} — {displayDate(data?.endDate)}</strong></div>
          <div className={styles.dateFilter}>
            <CalendarDays/><input aria-label="开始日期" type="date" value={draftStart} onChange={event=>setDraftStart(event.target.value)}/>
            <span>至</span>
            <input aria-label="结束日期" type="date" value={draftEnd} onChange={event=>setDraftEnd(event.target.value)}/>
            <button onClick={applyFilter}><Search/>筛选</button>
            {filter&&<button className={styles.reset} onClick={resetFilter}><RotateCcw/>最近 30 天</button>}
          </div>
        </section>
        {error&&<div className={styles.error}>{error}</div>}
        <section className={styles.summary}>
          <Summary icon={<Activity/>} label="活动次数" value={data?.summary.activityCount??0} unit="次"/>
          <Summary icon={<Flame/>} label="运动消耗" value={Math.round(data?.summary.totalCalories??0)} unit="kcal"/>
          <Summary icon={<Clock3/>} label="运动时长" value={formatTotalDuration(data?.summary.totalDurationSeconds??0)} unit=""/>
        </section>

        <section className={styles.log}>
          <div className={styles.logHead}><div><p>COROS DETAILS</p><h2>活动明细</h2></div><span>共 {data?.pagination.total??0} 条</span></div>
          {loading?<div className={styles.loading}><LoaderCircle/><span>正在读取运动记录…</span></div>:!grouped.length?<div className={styles.empty}><Dumbbell/><b>该范围内暂无运动记录</b><span>调整时间范围或先同步 COROS。</span></div>:<div className={styles.groups}>{grouped.map(([date,activities])=><article key={date}>
            <div className={styles.dateColumn}><strong>{date.slice(8)}</strong><div><b>{formatWeekday(date)}</b><span>{date}</span></div></div>
            <div>{activities.map(item=><div className={styles.row} key={item.id}>
              <span className={styles.icon}><Dumbbell/></span>
              <div><b>{item.name}</b><span>{formatTime(item.startTime)}{item.durationSeconds?` · ${formatDuration(item.durationSeconds)}`:""}</span></div>
              <strong>{item.caloriesKcal.toFixed(2)}<small> kcal</small></strong>
            </div>)}</div>
          </article>)}</div>}
          <div className={styles.pagination}>
            <span>第 {data?.pagination.page??1} / {data?.pagination.totalPages??1} 页</span>
            <div>
              <button disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft/>上一页</button>
              {pageNumbers(data?.pagination.page??1,data?.pagination.totalPages??1).map(value=><button key={value} className={value===page?styles.current:""} onClick={()=>setPage(value)}>{value}</button>)}
              <button disabled={loading||page>=(data?.pagination.totalPages??1)} onClick={()=>setPage(value=>value+1)}>下一页<ChevronRight/></button>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>;
}

function Summary({icon,label,value,unit}:{icon:React.ReactNode;label:string;value:number|string;unit:string}){
  return <div><span>{icon}</span><div><small>{label}</small><strong>{typeof value==="number"?value.toLocaleString():value} <em>{unit}</em></strong></div></div>;
}

function pageNumbers(page:number,total:number){const start=Math.max(1,Math.min(page-1,total-2));return Array.from({length:Math.min(3,total)},(_,index)=>start+index);}
function chinaDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function displayDate(value?:string){return value?value.replaceAll("-","/"):"—";}
function formatWeekday(value:string){return new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",weekday:"long",month:"long",day:"numeric"}).format(new Date(`${value}T12:00:00+08:00`));}
function formatTime(value:string|null){return value?new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"时间未记录";}
function formatDuration(seconds:number){const minutes=Math.round(seconds/60);return minutes>=60?`${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟`:`${minutes} 分钟`;}
function formatTotalDuration(seconds:number){const hours=Math.floor(seconds/3600);const minutes=Math.round(seconds%3600/60);return `${hours}h ${minutes}m`;}
