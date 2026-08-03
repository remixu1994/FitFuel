"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, CalendarDays, ChevronDown, ChevronRight, ClipboardList, CookingPot,
  Droplets, Dumbbell, Flame, Heart, Leaf, LoaderCircle, LogOut, Menu, Moon,
  ScanLine, Search, Settings, ShieldCheck, Sun, Utensils, X, Zap
} from "lucide-react";
import { api } from "@/lib/client";
import { AppSidebar } from "@/components/AppSidebar";
import { mealLabel, mealOrder } from "@/lib/meal-types";
import styles from "./records.module.css";

type User = { id:number; email:string; displayName:string; role:string };
type MealItem = {
  id:number; name:string; quantity:number; unit:string; calories:number;
  protein:number; carbohydrate:number; fat:number; dietaryFiber:number; source?:string; catalogExists?:boolean;
};
type Meal = { id:number; type:string; name:string; sortOrder:number; items:MealItem[] };
type RecordDay = {
  date:string; recordId:number|null; weight:number|null; activityCalories:number;
  recordedCalories:number; mealCalories:number; manualCalories:number|null;
  importedCalories:number|null; caloriesSource:string; water:number; note:string|null; meals:Meal[];
  elevatineCalories:number|null;
  totals:{calories:number;protein:number;carbohydrate:number;fat:number;dietaryFiber:number};
};
type RecordsData = { range:string; records:RecordDay[] };

const nav = [
  [CalendarDays,"今日饮食","/"],
  [ClipboardList,"饮食记录","/records"],
  [Dumbbell,"运动消耗","/activity"],
  [ScanLine,"AI 识别记录","/sync/elevatine"],
  [BarChart3,"体重分析","/stats"],
  [ClipboardList,"报告统计","/stats"],
  [Heart,"我的收藏","#"],
  [Settings,"设置","/settings"]
] as const;

const mealIcons: Record<string, typeof Sun> = {
  breakfast: Sun,
  lunch: Utensils,
  dinner: Moon,
  snack: CookingPot
};

export default function RecordsPage() {
  const router = useRouter();
  const [days,setDays] = useState(7);
  const [data,setData] = useState<RecordsData|null>(null);
  const [user,setUser] = useState<User|null>(null);
  const [query,setQuery] = useState("");
  const [expanded,setExpanded] = useState<string[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [menuOpen,setMenuOpen] = useState(false);
  const [revision,setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError("");
      try {
        const [records,session] = await Promise.all([
          api<RecordsData>(`/api/records?days=${days}`),
          api<{user:User}>("/api/auth/session")
        ]);
        if (!active) return;
        setData(records); setUser(session.user);
        const firstLogged = records.records.find(day => hasIntake(day));
        setExpanded(firstLogged ? [firstLogged.date] : []);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "饮食记录加载失败";
        if (message === "请先登录") router.replace("/login"); else setError(message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [days,router,revision]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("zh-CN");
    if (!term) return data?.records ?? [];
    return (data?.records ?? []).filter(day => {
      const dateText = formatDate(day.date).toLocaleLowerCase("zh-CN");
      return day.date.includes(term)
        || dateText.includes(term)
        || day.meals.some(meal =>
          meal.name.toLocaleLowerCase("zh-CN").includes(term)
          || meal.items.some(item => item.name.toLocaleLowerCase("zh-CN").includes(term))
        );
    });
  }, [data,query]);

  const summary = useMemo(() => {
    const records = data?.records ?? [];
    const logged = records.filter(hasIntake);
    const calories = logged.reduce((sum,day) => sum + day.totals.calories,0);
    return {
      loggedDays: logged.length,
      average: logged.length ? Math.round(calories/logged.length) : 0,
      meals: logged.reduce((sum,day) => sum + day.meals.filter(meal => meal.items.length).length,0),
      water: records.reduce((sum,day) => sum + day.water,0)
    };
  }, [data]);

  function toggle(date:string) {
    setExpanded(current => current.includes(date)
      ? current.filter(value => value !== date)
      : [...current,date]);
  }
  async function logout() {
    await api("/api/auth/logout",{method:"POST"});
    router.replace("/login"); router.refresh();
  }
  async function changeSource(day:RecordDay,source:string) {
    setError("");
    try {
      await api(`/api/daily-records/${day.date}/calories-source`,{
        method:"PATCH",body:JSON.stringify({source})
      });
      setRevision(value=>value+1);
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"切换摄入来源失败");
    }
  }

  return <div className={styles.shell}>
    <AppSidebar user={user}/>

    <main className={styles.main}>
      <header className={styles.header}>
        <div><p>FOOD JOURNAL</p><h1>每日饮食摄入</h1><span>按天回顾餐食、营养和饮水记录</span></div>
        <button onClick={()=>router.push("/")}><CalendarDays/> 记录今日饮食</button>
      </header>
      {error&&<div className="global-message error">{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}
      {loading ? <div className="page-loading"><LoaderCircle/> 正在整理饮食记录…</div> :
      <div className={styles.content}>
        <section className={styles.toolbar}>
          <div className={styles.search}><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索食品、餐次或日期"/>{query&&<button aria-label="清除搜索" onClick={()=>setQuery("")}><X/></button>}</div>
          <div className={styles.ranges}>{[7,30,90].map(value=><button key={value} className={days===value?styles.active:""} onClick={()=>setDays(value)}>{value} 天</button>)}</div>
        </section>

        <section className={styles.summary} aria-label="饮食记录概览">
          <Summary label="有摄入记录" value={summary.loggedDays} unit={`/ ${days} 天`} icon={<CalendarDays/>}/>
          <Summary label="日均摄入" value={summary.average} unit="千卡" icon={<Flame/>}/>
          <Summary label="已记录餐次" value={summary.meals} unit="餐" icon={<Utensils/>}/>
          <Summary label="累计饮水" value={summary.water} unit="ml" icon={<Droplets/>}/>
        </section>

        <div className={styles.listHead}><div><p>DAILY LOGS</p><h2>{query?`“${query}”的搜索结果`:`最近 ${days} 天`}</h2></div><span>{filtered.length} 个日期</span></div>
        <section className={styles.list}>
          {filtered.map((day,index) => {
            const isOpen=expanded.includes(day.date);
            const logged=hasIntake(day);
            return <article className={`${styles.day} ${isOpen?styles.open:""}`} style={{animationDelay:`${Math.min(index,8)*35}ms`}} key={day.date}>
              <button className={styles.dayRow} onClick={()=>toggle(day.date)} aria-expanded={isOpen}>
                <span className={styles.dateBlock}><b>{day.date.slice(8)}</b><span><strong>{formatDate(day.date)}</strong><small>{day.date}</small></span></span>
                <span className={styles.dayStatus}>{logged?<><i/>已记录</>:<>未记录</>}</span>
                <span className={styles.calories}><strong>{Math.round(day.totals.calories)}</strong><small>千卡</small></span>
                <Macro icon={<Zap/>} label="碳水" value={day.totals.carbohydrate}/>
                <Macro icon={<Dumbbell/>} label="蛋白质" value={day.totals.protein}/>
                <Macro icon={<Droplets/>} label="脂肪" value={day.totals.fat}/>
                <span className={styles.expandIcon}>{isOpen?<ChevronDown/>:<ChevronRight/>}</span>
              </button>
              {isOpen&&<div className={styles.details}>
                {day.meals.filter(meal=>meal.items.length).length ? day.meals.filter(meal=>meal.items.length).map(meal=><MealDetail meal={meal} key={meal.id}/>) :
                  <div className={styles.emptyDay}><CookingPot/><div><b>这一天还没有餐食记录</b><span>前往今日饮食，切换日期后可补录食品。</span></div><button onClick={()=>router.push("/")}>去记录 <ChevronRight/></button></div>}
                <div className={styles.dayFoot}><span><Droplets/> 饮水 {day.water} ml</span>{day.weight&&<span>体重 {day.weight} kg</span>}<span>摄入来源：{sourceLabel(day.caloriesSource)}</span>{availableSources(day).length>1&&<label className={styles.sourceSwitch}>统计使用<select value={day.caloriesSource} onChange={event=>void changeSource(day,event.target.value)}>{availableSources(day).map(source=><option value={source} key={source}>{sourceLabel(source)}</option>)}</select></label>}{day.note&&<span>备注：{day.note}</span>}</div>
              </div>}
            </article>;
          })}
          {!filtered.length&&<div className={styles.emptySearch}><Search/><b>没有找到匹配记录</b><span>试试食品名、餐次名称或 YYYY-MM-DD 日期。</span><button onClick={()=>setQuery("")}>清除搜索</button></div>}
        </section>
      </div>}
    </main>
  </div>;
}

function Summary({label,value,unit,icon}:{label:string;value:number;unit:string;icon:React.ReactNode}) {
  return <div className={styles.summaryItem}><span>{icon}</span><div><small>{label}</small><p><strong>{value.toLocaleString()}</strong> {unit}</p></div></div>;
}

function Macro({icon,label,value}:{icon:React.ReactNode;label:string;value:number}) {
  return <span className={styles.macro}>{icon}<span><small>{label}</small><b>{Math.round(value)}g</b></span></span>;
}

function MealDetail({meal}:{meal:Meal}) {
  const Icon=mealIcons[meal.type]??Utensils;
  const order=mealOrder(meal.type);
  const calories=meal.items.reduce((sum,item)=>sum+item.calories,0);
  return <section className={styles.meal}>
    <div className={styles.mealTitle}><span><Icon/></span><div><b>{order?mealLabel(order):meal.name}</b><small>{meal.items.length} 项食品</small></div><strong>{Math.round(calories)} 千卡</strong></div>
    <div className={styles.foods}>{meal.items.map(item=><div key={item.id}><div><b>{item.name}{item.source==="elevatine"&&!item.catalogExists&&<em className={styles.foodPending} title="该食品来自 Elavatine，尚未录入共享食品库">!</em>}</b><small>{item.quantity} {item.unit}</small></div><strong>{Math.round(item.calories)} 千卡</strong></div>)}</div>
  </section>;
}

function hasIntake(day:RecordDay) {
  return day.totals.calories>0 || day.meals.some(meal=>meal.items.length) || day.water>0;
}

function availableSources(day:RecordDay) {
  return [
    ...(day.mealCalories>0?["meals"]:[]),
    ...(day.manualCalories!==null?["manual"]:[]),
    ...(day.importedCalories!==null?["import"]:[])
    ,...(day.elevatineCalories!==null?["elevatine"]:[])
  ];
}

function sourceLabel(source:string) {
  return {meals:"餐食汇总",manual:"手工录入",import:"文件导入",elevatine:"Elavatine 同步"}[source]??source;
}

function formatDate(value:string) {
  const date=new Date(`${value}T12:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"long",day:"numeric",weekday:"short"}).format(date);
}
