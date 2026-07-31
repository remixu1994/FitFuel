"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Apple, BarChart3, Bell, Bot, CalendarDays, ChevronLeft, ChevronRight, ClipboardList,
  CookingPot, Droplets, Dumbbell, Ellipsis, Flame, GlassWater, Heart, Leaf, LoaderCircle,
  LogOut, Menu, Moon, Pencil, Plus, Save, ScanLine, Search, Settings, ShieldCheck,
  Sparkles, Sun, Trash2, X, Zap
} from "lucide-react";
import { api, chinaDate, shiftDate } from "@/lib/client";
import { AppSidebar } from "@/components/AppSidebar";

type Food = {
  key:string;name:string;brand?:string;serving:string;gram_weight:number;calories:number;
  protein:number;carbohydrate:number;fat:number;dietary_fiber:number;source:string;
  confidence?:number;reason?:string;candidateToken?:string;
};
type MealItem={id:number;name:string;quantity:number;unit:string;gramWeight:number|null;calories:number;protein:number;carbohydrate:number;fat:number;dietaryFiber:number;source:string};
type Meal={id:number;type:string;name:string;sortOrder:number;source?:string;items:MealItem[]};
type DailyData={
  record:null|Record<string,number|string>;goal:null|Record<string,number>;
  profile:null|Record<string,number|string>;meals:Meal[];water:number;
};
type User={id:number;email:string;displayName:string;role:string;mustChangePassword:boolean};

const mealConfig=[
  {type:"breakfast",name:"早餐",time:"07:00–09:00",icon:Sun,tone:"#ffb42d"},
  {type:"lunch",name:"午餐",time:"12:00–14:00",icon:Sun,tone:"#f7bd20"},
  {type:"dinner",name:"晚餐",time:"18:00–20:00",icon:Moon,tone:"#75a6a2"},
  {type:"snack",name:"加餐",time:"其他时间",icon:Apple,tone:"#e95cb5"}
];
const nav=[
  [CalendarDays,"今日饮食","/"],[ClipboardList,"饮食记录","/records"],
  [Dumbbell,"运动消耗","/activity"],[ScanLine,"AI 识别记录","/sync/elevatine"],[BarChart3,"营养分析","/stats"],
  [ClipboardList,"报告统计","/stats"],[Heart,"我的收藏","#"],[Settings,"设置","/settings"]
] as const;

export default function Dashboard(){
  const router=useRouter();
  const [date,setDate]=useState("");
  const [data,setData]=useState<DailyData|null>(null);
  const [user,setUser]=useState<User|null>(null);
  const [foods,setFoods]=useState<Food[]>([]);
  const [picker,setPicker]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [foodSearching,setFoodSearching]=useState(false);
  const [hasSearched,setHasSearched]=useState(false);
  const [aiReview,setAiReview]=useState<Food|null>(null);
  const [editingItem,setEditingItem]=useState<MealItem|null>(null);
  const [error,setError]=useState("");
  const [menuOpen,setMenuOpen]=useState(false);
  const foodSearchSequence=useRef(0);

  const load=useCallback(async()=>{
    if(!date)return;
    setLoading(true);setError("");
    try{
      const [daily,session]=await Promise.all([
        api<DailyData>(`/api/daily-records/${date}`),
        api<{user:User}>("/api/auth/session")
      ]);
      setData(daily);setUser(session.user);
    }catch(error){
      const message=error instanceof Error?error.message:"加载失败";
      if(message==="请先登录") router.replace("/login"); else setError(message);
    }finally{setLoading(false);}
  },[date,router]);
  useEffect(()=>{setDate(chinaDate());},[]);
  useEffect(()=>{void load();},[load]);

  const searchFoods=useCallback(async(value:string)=>{
    const term=value.trim();
    const sequence=++foodSearchSequence.current;
    if(!term){
      setFoods([]);setFoodSearching(false);setHasSearched(false);setAiReview(null);
      return;
    }
    setFoodSearching(true);setHasSearched(true);setError("");setAiReview(null);setFoods([]);
    try{
      const result=await api<{foods:Food[];canUseAi:boolean}>(`/api/foods?q=${encodeURIComponent(term)}`);
      if(sequence!==foodSearchSequence.current)return;
      if(result.foods.length||!result.canUseAi||term.length<2){setFoods(result.foods);}
      else{
        const ai=await api<{candidate?:Food;candidateToken?:string;existingFood?:Food}>("/api/admin/foods/ai-search",{
          method:"POST",body:JSON.stringify({query:term})
        });
        if(sequence!==foodSearchSequence.current)return;
        setFoods(ai.existingFood?[ai.existingFood]:ai.candidate?[{...ai.candidate,candidateToken:ai.candidateToken}]:[]);
      }
    }
    catch(error){
      if(sequence===foodSearchSequence.current){
        setError(error instanceof Error?error.message:"食品搜索失败");
      }
    }
    finally{
      if(sequence===foodSearchSequence.current)setFoodSearching(false);
    }
  },[]);

  function updateFoodQuery(value:string){
    foodSearchSequence.current++;
    setQuery(value);setFoods([]);setHasSearched(false);setAiReview(null);setFoodSearching(false);
  }
  function openPicker(mealType:string,initialQuery=""){
    const term=initialQuery.trim();
    setPicker(mealType);setFoods([]);setHasSearched(false);setAiReview(null);setError("");
    if(term){
      setQuery(term);
      void searchFoods(term);
    }else{
      updateFoodQuery("");
    }
  }
  function closePicker(){
    foodSearchSequence.current++;
    setPicker(null);setAiReview(null);setFoods([]);setFoodSearching(false);setHasSearched(false);
  }

  const meals=[
    ...mealConfig.map(config=>({
      ...config,source:"manual",items:data?.meals.find(meal=>meal.type===config.type)?.items??[]
    })),
    ...(data?.meals.filter(meal=>!mealConfig.some(config=>config.type===meal.type)).map(meal=>({
      type:meal.type,name:meal.name,time:"Elavatine 同步",icon:CookingPot,tone:"#168cf7",
      source:meal.source||"elevatine",items:meal.items
    }))??[])
  ];
  const mealTotals=useMemo(()=>meals.flatMap(meal=>meal.items).reduce((sum,item)=>({
    calories:sum.calories+item.calories,protein:sum.protein+item.protein,
    carbs:sum.carbs+item.carbohydrate,fat:sum.fat+item.fat,fiber:sum.fiber+item.dietaryFiber
  }),{calories:0,protein:0,carbs:0,fat:0,fiber:0}),[meals]);
  const totals={
    calories:data?.record?.calories_source==="elevatine"?Number(data.record.elevatine_calories??data.record.calories_consumed??0):mealTotals.calories,
    carbs:data?.record?.macro_source==="elevatine"?Number(data.record.elevatine_carbohydrate??0):mealTotals.carbs,
    protein:data?.record?.macro_source==="elevatine"?Number(data.record.elevatine_protein??0):mealTotals.protein,
    fat:data?.record?.macro_source==="elevatine"?Number(data.record.elevatine_fat??0):mealTotals.fat,
    fiber:mealTotals.fiber
  };
  const goal={
    calories:Number(data?.goal?.calories_kcal??1800),protein:Number(data?.goal?.protein_g??110),
    carbs:Number(data?.goal?.carbohydrate_g??200),fat:Number(data?.goal?.fat_g??60),
    water:Number(data?.goal?.water_ml??2000)
  };

  async function addFood(food:Food){
    if(!picker)return;setSaving(true);setError("");
    try{
      if(food.source==="ai"){
        await api("/api/admin/foods/ai-import",{method:"POST",body:JSON.stringify({
          candidateToken:food.candidateToken,date,mealType:picker,quantity:1,
          food:{name:food.name,serving:food.serving,gramWeight:food.gram_weight,
            calories:food.calories,protein:food.protein,carbohydrate:food.carbohydrate,
            fat:food.fat,dietaryFiber:food.dietary_fiber}
        })});
      }else{
        await api("/api/meals/items",{method:"POST",body:JSON.stringify({
          date,mealType:picker,foodKey:food.key,quantity:1
        })});
      }
      closePicker();await load();
    }catch(error){setError(error instanceof Error?error.message:"添加失败");}
    finally{setSaving(false);}
  }
  async function deleteItem(id:number){
    if(!confirm("移除此项食物？你可以在设置中心的回收站恢复。"))return;
    await api(`/api/meals/items/${id}`,{method:"DELETE"});await load();
  }
  async function addWater(){
    setSaving(true);
    try{await api("/api/water",{method:"POST",body:JSON.stringify({date,amount:250})});await load();}
    finally{setSaving(false);}
  }
  async function logout(){
    await api("/api/auth/logout",{method:"POST"});router.replace("/login");router.refresh();
  }
  const reviewField=(key:keyof Food,value:string|number)=>setAiReview(current=>current?{...current,[key]:value}:current);

  return <div className="app-shell">
    <AppSidebar user={user}/>
    <main>
      <header><div><p className="eyebrow">NUTRITION JOURNAL</p><h1>今日饮食</h1><p className="date">{date||"今日"}<CalendarDays size={16}/></p></div>
        <div className="header-actions">
          <div className="date-switch"><button disabled={!date} onClick={()=>setDate(shiftDate(date,-1))}><ChevronLeft/></button><b>{!date||date===chinaDate()?"今天":date.slice(5)}</b><button disabled={!date} onClick={()=>setDate(shiftDate(date,1))}><ChevronRight/></button></div>
          <button className="ghost" onClick={()=>router.push("/settings")}><Settings size={17}/> 设置中心</button>
          <button className="primary" onClick={()=>openPicker("breakfast")}><Plus size={18}/> 快速添加</button>
        </div>
        <div className="account"><button><Bell size={20}/></button><div className="avatar">{user?.displayName?.[0]??"U"}</div></div>
      </header>
      {error&&<div className="global-message error">{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}
      {loading?<div className="page-loading"><LoaderCircle/> 正在加载今日记录…</div>:<div className="workspace">
        <section className="main-column">
          <section className="goal-panel">
            <div className="section-heading"><div><span>DAILY TARGET</span><h2>营养目标进度</h2></div><button onClick={()=>router.push("/settings?tab=goal")}>调整目标 <ChevronRight size={15}/></button></div>
            <div className="rings">
              <ProgressRing value={totals.calories} goal={goal.calories} label="热量" unit="千卡" color="#ff7a36" icon={<Flame/>}/>
              <ProgressRing value={totals.carbs} goal={goal.carbs} label="碳水" unit="g" color="#4aa6ef" icon={<Zap/>}/>
              <ProgressRing value={totals.protein} goal={goal.protein} label="蛋白质" unit="g" color="#28ad67" icon={<Dumbbell/>}/>
              <ProgressRing value={totals.fat} goal={goal.fat} label="脂肪" unit="g" color="#efb62d" icon={<Droplets/>}/>
            </div>
          </section>
          <section className="meals">{meals.map(({type,name,time,icon:Icon,tone,source,items})=>{
            const calories=items.reduce((sum,item)=>sum+item.calories,0);
            return <article className="meal" key={type}>
              <div className="meal-top"><span className="meal-icon" style={{color:tone,background:`${tone}18`}}><Icon size={16}/></span><b>{name}</b><small>{time}</small><strong>{Math.round(calories)} 千卡</strong><button><Ellipsis size={18}/></button></div>
              {items.map(item=><div className="meal-food" key={item.id}><div><b>{item.name}</b><small>{item.quantity} {item.unit}</small></div><span>{Math.round(item.calories)} 千卡</span><button className="item-edit" aria-label={`编辑${item.name}`} onClick={()=>setEditingItem(item)}><Pencil size={14}/></button><button className="item-delete" aria-label={`删除${item.name}`} onClick={()=>deleteItem(item.id)}><Trash2 size={14}/></button></div>)}
              {source!=="elevatine"&&<button className="add-meal" onClick={()=>openPicker(type)}><Plus size={18}/> 添加食物</button>}
            </article>;
          })}</section>
          <section className="quick-add"><div className="section-heading"><div><span>FOOD DATABASE</span><h2>搜索食品库</h2></div></div>
            <div className="searchbox"><Search/><input value={query} onChange={e=>updateFoodQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&openPicker("breakfast",query)} placeholder="搜索共享食品库"/><button onClick={()=>openPicker("breakfast",query)}>搜索</button></div>
            <div className="empty-inline"><CookingPot/><span>共享食品来自 food_info；私人食品仍只对你可见。</span></div>
          </section>
          <div className="tip"><Sparkles/><span><b>真实数据已接入</b> 每次记录都会保存到你的账号，并同步更新统计模型。</span></div>
        </section>
        <aside className="insights">
          <section><div className="section-heading"><div><span>TODAY</span><h2>营养摄入详情</h2></div></div>
            <NutrientBar label="热量" value={totals.calories} goal={goal.calories} unit="千卡" color="#ff7138" icon={<Flame/>}/>
            <NutrientBar label="碳水化合物" value={totals.carbs} goal={goal.carbs} unit="g" color="#4ba8ed" icon={<Zap/>}/>
            <NutrientBar label="蛋白质" value={totals.protein} goal={goal.protein} unit="g" color="#25ad67" icon={<Dumbbell/>}/>
            <NutrientBar label="脂肪" value={totals.fat} goal={goal.fat} unit="g" color="#eeb529" icon={<Droplets/>}/>
          </section>
          <section className="ai-panel"><div className="section-heading"><div><span>AI COACH</span><h2>营养分析</h2></div></div><div className="ai-orb"><Bot/></div><b>{totals.calories?"今日记录已同步":"等待你的第一餐"}</b><p>{totals.calories?`已摄入 ${Math.round(totals.calories)} 千卡，距离目标还差 ${Math.max(0,Math.round(goal.calories-totals.calories))} 千卡。`:"添加食物后，这里会基于真实摄入提供反馈。"}</p></section>
          <section className="water-panel"><div className="section-heading"><div><span>HYDRATION</span><h2>饮水量</h2></div></div><div className="water-number"><b>{data?.water??0}</b> ml <span>/ {goal.water} ml</span></div><div className="water-track"><i style={{width:`${Math.min(100,(data?.water??0)/goal.water*100)}%`}}/></div>
            <div className="glasses">{[.2,.4,.6,.8,1].map(level=><button className={(data?.water??0)>=goal.water*level?"filled":""} key={level}><GlassWater/><small>{level*100}%</small></button>)}</div>
            <button className="water-button" disabled={saving} onClick={addWater}><Plus/> 记录 250ml</button>
          </section>
        </aside>
      </div>}
    </main>
    {picker&&<div className="modal-backdrop" onMouseDown={closePicker}><div className="food-picker" onMouseDown={e=>e.stopPropagation()}>
      <div className="picker-head"><div><span>ADD TO {mealConfig.find(m=>m.type===picker)?.name}</span><h2>{aiReview?"审核 AI 食品":"添加食物"}</h2></div><button onClick={closePicker}><X/></button></div>
      {aiReview?<div className="ai-review-form">
        <div className="ai-review-note"><Bot/><div><b>管理员审核</b><span>确认后将写入共享食品库，并加入当前餐次。</span></div></div>
        <label>食品名称<input value={aiReview.name} onChange={e=>reviewField("name",e.target.value)}/></label>
        <div className="form-pair"><label>份量名称<input value={aiReview.serving} onChange={e=>reviewField("serving",e.target.value)}/></label><label>克重<input type="number" value={aiReview.gram_weight} onChange={e=>reviewField("gram_weight",+e.target.value)}/></label></div>
        <label>热量（kcal）<input type="number" value={aiReview.calories} onChange={e=>reviewField("calories",+e.target.value)}/></label>
        <div className="form-pair"><label>蛋白质（g）<input type="number" value={aiReview.protein} onChange={e=>reviewField("protein",+e.target.value)}/></label><label>碳水（g）<input type="number" value={aiReview.carbohydrate} onChange={e=>reviewField("carbohydrate",+e.target.value)}/></label></div>
        <div className="form-pair"><label>脂肪（g）<input type="number" value={aiReview.fat} onChange={e=>reviewField("fat",+e.target.value)}/></label><label>膳食纤维（g）<input type="number" value={aiReview.dietary_fiber} onChange={e=>reviewField("dietary_fiber",+e.target.value)}/></label></div>
        <p>{aiReview.reason}</p>
        <button className="save-record" disabled={saving} onClick={()=>addFood(aiReview)}>{saving?"正在保存…":"保存到共享库并加入当前餐次"}</button>
        <button className="back-step" onClick={()=>setAiReview(null)}>返回搜索结果</button>
      </div>:<>
      <div className="searchbox"><Search/><input autoFocus value={query} onChange={e=>updateFoodQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!foodSearching&&searchFoods(query)} placeholder="输入食品名称"/><button disabled={foodSearching||!query.trim()} onClick={()=>searchFoods(query)}>{foodSearching?"AI 检索中":"搜索"}</button></div>
      <p className="picker-label">{foodSearching?"正在检索共享食品":foods.some(food=>food.source==="ai")?"Mimo AI 待审核结果":foods.length?"搜索结果":"输入关键词搜索 food_info"}</p>
      {foodSearching&&<div className="ai-searching"><span><Bot/></span><div><b>正在补充食品数据</b><small>{user?.role==="admin"?"共享库无结果时，Mimo 会提供待审核候选":"正在查询共享食品和你的私人食品"}</small></div><LoaderCircle/></div>}
      {!foodSearching&&<div className="picker-list">{foods.map(food=><button className={food.source==="ai"?"ai-food":""} disabled={saving} key={food.key} onClick={()=>food.source==="ai"?setAiReview(food):addFood(food)}><div><div className="food-result-title"><b>{food.name}</b>{food.source==="ai"&&<em>待审核</em>}</div><small>{food.serving} · 蛋白质 {Number(food.protein).toFixed(1)}g</small>{food.source==="ai"&&<small className="ai-reason">{food.reason}</small>}</div><strong>{Math.round(food.calories)}<small> 千卡</small></strong><Plus/></button>)}</div>}
      {!foodSearching&&!foods.length&&<div className="picker-empty"><Search/><b>{hasSearched?"暂无匹配结果":"搜索共享食品"}</b><span>{hasSearched?(user?.role==="admin"?"Mimo 也未能生成可靠结果":"可创建仅自己可见的私人食品"):"输入食品名称开始搜索"}</span></div>}
      {foods.some(food=>food.source==="ai")&&<div className="ai-disclaimer"><Sparkles/><span><b>Mimo 待审核候选</b> 管理员确认营养数据后才会写入共享食品库。</span></div>}
      <button className="ai-entry" onClick={()=>router.push("/settings?tab=foods")}><CookingPot/><span><b>创建私人食品</b><small>录入自己的品牌或自制食物</small></span><ChevronRight/></button>
      </>}
    </div></div>}
    {editingItem&&<MealItemEditor item={editingItem} onClose={()=>setEditingItem(null)} onSaved={async()=>{setEditingItem(null);await load();}} onError={setError}/>}
  </div>;
}

function MealItemEditor({item,onClose,onSaved,onError}:{item:MealItem;onClose:()=>void;onSaved:()=>Promise<void>;onError:(message:string)=>void}){
  const [form,setForm]=useState({
    name:item.name,quantity:String(item.quantity),unit:item.unit,
    gramWeight:item.gramWeight==null?"":String(item.gramWeight),
    calories:String(item.calories),protein:String(item.protein),
    carbohydrate:String(item.carbohydrate),fat:String(item.fat),
    dietaryFiber:String(item.dietaryFiber)
  });
  const [busy,setBusy]=useState(false);
  const [aiBusy,setAiBusy]=useState(false);
  const [reason,setReason]=useState("");
  useEffect(()=>{
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy&&!aiBusy)onClose();};
    window.addEventListener("keydown",closeOnEscape);
    return ()=>{
      document.body.style.overflow=previousOverflow;
      window.removeEventListener("keydown",closeOnEscape);
    };
  },[aiBusy,busy,onClose]);
  const field=(key:keyof typeof form,value:string)=>setForm(current=>({...current,[key]:value}));
  async function estimate(){
    setAiBusy(true);onError("");
    try{
      const result=await api<{estimate:{calories:number;protein:number;carbohydrate:number;fat:number;dietaryFiber:number;confidence:number;reason:string}}>(`/api/meals/items/${item.id}/ai-estimate`,{method:"POST",body:"{}"});
      setForm(current=>({...current,calories:String(result.estimate.calories),protein:String(result.estimate.protein),carbohydrate:String(result.estimate.carbohydrate),fat:String(result.estimate.fat),dietaryFiber:String(result.estimate.dietaryFiber)}));
      setReason(`${Math.round(result.estimate.confidence*100)}% 置信度 · ${result.estimate.reason}`);
    }catch(error){onError(error instanceof Error?error.message:"AI 营养估算失败");}
    finally{setAiBusy(false);}
  }
  async function save(){
    setBusy(true);onError("");
    try{
      await api(`/api/meals/items/${item.id}`,{method:"PATCH",body:JSON.stringify({
        name:form.name,quantity:Number(form.quantity),unit:form.unit,
        gramWeight:form.gramWeight===""?null:Number(form.gramWeight),
        calories:Number(form.calories),protein:Number(form.protein),
        carbohydrate:Number(form.carbohydrate),fat:Number(form.fat),
        dietaryFiber:Number(form.dietaryFiber)
      })});
      await onSaved();
    }catch(error){onError(error instanceof Error?error.message:"保存食品失败");}
    finally{setBusy(false);}
  }
  return <div className="record-backdrop meal-editor-backdrop" onMouseDown={onClose}><aside className="record-drawer meal-item-editor" role="dialog" aria-modal="true" aria-labelledby="meal-editor-title" onMouseDown={event=>event.stopPropagation()}>
    <div className="drawer-head"><div><p>MEAL ITEM</p><h2 id="meal-editor-title">编辑食品信息</h2><span>修改当前餐食快照，不会覆盖共享或私人食品库</span></div><button onClick={onClose} aria-label="关闭编辑食品弹窗"><X/></button></div>
    <button className="meal-ai-fill" disabled={aiBusy} onClick={()=>void estimate()}>{aiBusy?<LoaderCircle className="spin"/>:<Sparkles/>}<span><b>{aiBusy?"正在估算营养数据…":"使用 MiMo 补全营养"}</b><small>按当前食品名称和实际份量估算，结果可继续修改</small></span></button>
    {reason&&<p className="meal-ai-reason">{reason}</p>}
    <label>食品名称<div><input value={form.name} onChange={event=>field("name",event.target.value)}/></div></label>
    <div className="form-pair"><label>数量<div><input type="number" step=".01" value={form.quantity} onChange={event=>field("quantity",event.target.value)}/></div></label><label>单位<div><input value={form.unit} onChange={event=>field("unit",event.target.value)}/></div></label></div>
    <label>克重（可选）<div><input type="number" step=".01" value={form.gramWeight} onChange={event=>field("gramWeight",event.target.value)}/></div></label>
    <label>热量（kcal）<div><input type="number" step=".01" value={form.calories} onChange={event=>field("calories",event.target.value)}/></div></label>
    <div className="form-pair"><label>蛋白质（g）<div><input type="number" step=".01" value={form.protein} onChange={event=>field("protein",event.target.value)}/></div></label><label>碳水（g）<div><input type="number" step=".01" value={form.carbohydrate} onChange={event=>field("carbohydrate",event.target.value)}/></div></label></div>
    <div className="form-pair"><label>脂肪（g）<div><input type="number" step=".01" value={form.fat} onChange={event=>field("fat",event.target.value)}/></div></label><label>膳食纤维（g）<div><input type="number" step=".01" value={form.dietaryFiber} onChange={event=>field("dietaryFiber",event.target.value)}/></div></label></div>
    <button className="save-record" disabled={busy||aiBusy} onClick={()=>void save()}>{busy?<LoaderCircle className="spin"/>:<Save/>}{busy?"正在保存…":"保存食品信息"}</button>
  </aside></div>;
}

function ProgressRing({value,goal,label,unit,color,icon}:{value:number;goal:number;label:string;unit:string;color:string;icon:React.ReactNode}){
  const percent=Math.min(100,Math.round(value/goal*100));
  return <div className="ring-item"><div className="ring" style={{"--progress":`${percent*3.6}deg`,"--ring":color} as React.CSSProperties}><div><span style={{color}}>{icon}</span><b>{Math.round(value)}</b><small>/ {goal}{unit==="g"?"g":""}</small></div></div><div className="ring-label"><b>{label}</b><span style={{color}}>{percent}%</span></div></div>;
}
function NutrientBar({label,value,goal,unit,color,icon}:{label:string;value:number;goal:number;unit:string;color:string;icon:React.ReactNode}){
  const percent=Math.min(100,Math.round(value/goal*100));
  return <div className="nutrient"><div className="nutrient-row"><span className="nutrient-icon" style={{color,background:`${color}18`}}>{icon}</span><b>{label}</b><span>{Math.round(value)} / {goal} {unit}</span><strong>{percent}%</strong></div><div className="bar"><i style={{width:`${percent}%`,background:color}}/></div></div>;
}
