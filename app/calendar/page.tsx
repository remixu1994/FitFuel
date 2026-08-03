"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, CalendarDays } from "lucide-react";
import { api } from "@/lib/client";
import { AppSidebar } from "@/components/AppSidebar";

type Day={date:string;calories:number;carbs:number;protein:number;fat:number;calories_source:string};
const pad=(n:number)=>String(n).padStart(2,"0");
function monthShift(value:string,delta:number){const [y,m]=value.split("-").map(Number);const d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
export default function CalendarStats(){
  const now=new Date();const [month,setMonth]=useState(`${now.getFullYear()}-${pad(now.getMonth()+1)}`);const [days,setDays]=useState<Day[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  useEffect(()=>{let active=true;setLoading(true);api<{days:Day[]}>(`/api/calendar?month=${month}`).then(data=>{if(active)setDays(data.days)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"统计加载失败")}).finally(()=>active&&setLoading(false));return()=>{active=false}},[month]);
  const cells=useMemo(()=>{const [y,m]=month.split("-").map(Number);const first=new Date(y,m-1,1).getDay();const offset=(first+6)%7;const prev=new Date(y,m-1,0).getDate();return Array.from({length:offset+days.length},(_,i)=>i<offset?{outside:true,date:`${y}-${pad(m-1||12)}-${pad(prev-offset+i+1)}`}:days[i-offset]);},[month,days]);
  return <div className="app-shell calendar-shell"><AppSidebar/><main><header><div><p className="eyebrow">NUTRITION CALENDAR</p><h1>统计</h1><p className="date">按月查看每日营养摄入</p></div><div className="calendar-month"><button onClick={()=>setMonth(monthShift(month,-1))}><ChevronLeft/></button><b>{month.replace("-","年")}月</b><button onClick={()=>setMonth(monthShift(month,1))}><ChevronRight/></button></div></header>{error&&<div className="global-message error">{error}</div>}<section className="calendar-card"><div className="calendar-title"><CalendarDays/><div><b>{month.replace("-","年")}月营养统计</b><span>热量与三大营养素每日概览</span></div></div><div className="calendar-week">{["一","二","三","四","五","六","日"].map(x=><b key={x}>{x}</b>)}</div>{loading?<div className="page-loading"><LoaderCircle/>正在加载统计…</div>:<div className="calendar-grid">{cells.map((day:any,i)=><div className={`calendar-day ${day.outside?"outside":""}`} key={`${day.date}-${i}`}><strong>{Number(day.date.slice(-2))}</strong>{!day.outside&&<><Metric color="#168cf7" label="卡" value={day.calories}/><Metric color="#8b5cf6" label="碳" value={day.carbs}/><Metric color="#f5b72c" label="蛋" value={day.protein}/><Metric color="#f0782e" label="脂" value={day.fat}/></>}</div>)}</div>}</section></main></div>;
}
function Metric({color,label,value}:{color:string;label:string;value:number}){return <div className="calendar-metric"><span style={{background:color,width:`${Math.min(100,Math.max(3,Number(value)/25))}%`}}/><em style={{color}}>{label}</em><small>{Math.round(Number(value))}</small></div>}
