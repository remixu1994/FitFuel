"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, CookingPot, History, Leaf, LoaderCircle, Plus, RefreshCcw, Save,
  Settings, Target, Trash2, UserRound, X
} from "lucide-react";
import { api } from "@/lib/client";

type Profile={email:string;display_name:string;height_cm:number;age:number;gender:string;initial_weight_kg:number;target_weight_kg:number};
type Goal={goal_type:string;calories_kcal:number;protein_g:number;carbohydrate_g:number;fat_g:number;water_ml:number};
type CustomFood={id:number;name:string;brand?:string;serving_name:string;gram_weight:number;calories:number;protein:number;carbohydrate:number;fat:number;dietary_fiber:number;deleted_at?:string};
type Trash={id:number;name:string;type:string;deleted_at:string};
type ImportBatch={id:number;fileName:string;format:string;status:string;rowCount:number;createdAt:string;committedAt:string|null;rolledBackAt:string|null;expiresAt:string};
type Tab="profile"|"goal"|"foods"|"imports"|"trash";
const manageTabs = [
  { value:"profile" as Tab, Icon:UserRound, label:"个人资料" },
  { value:"goal" as Tab, Icon:Target, label:"营养目标" },
  { value:"foods" as Tab, Icon:CookingPot, label:"私人食品" },
  { value:"imports" as Tab, Icon:History, label:"导入历史" },
  { value:"trash" as Tab, Icon:Trash2, label:"回收站" }
];

export default function SettingsPage(){
  const router=useRouter();
  const [tab,setTab]=useState<Tab>("profile");
  const [profile,setProfile]=useState<Profile|null>(null);
  const [goal,setGoal]=useState<Goal|null>(null);
  const [foods,setFoods]=useState<CustomFood[]>([]);
  const [trash,setTrash]=useState<Trash[]>([]);
  const [imports,setImports]=useState<ImportBatch[]>([]);
  const [editor,setEditor]=useState<Partial<CustomFood>|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load(){
    setLoading(true);
    try{
      const [p,g,f,t,i]=await Promise.all([
        api<{profile:Profile}>("/api/profile"),api<{goal:Goal}>("/api/goals/current"),
        api<{foods:CustomFood[]}>("/api/custom-foods"),api<{items:Trash[]}>("/api/trash"),
        api<{batches:ImportBatch[]}>("/api/data-imports")
      ]);
      setProfile(p.profile);setGoal(g.goal);setFoods(f.foods);setTrash(t.items);setImports(i.batches);
    }catch(error){setError(error instanceof Error?error.message:"加载失败");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  const success=(text:string)=>{setMessage(text);setTimeout(()=>setMessage(""),2500);};
  async function saveProfile(){
    if(!profile)return;setSaving(true);setError("");
    try{await api("/api/profile",{method:"PATCH",body:JSON.stringify({displayName:profile.display_name,height:profile.height_cm,age:profile.age,gender:profile.gender,initialWeight:profile.initial_weight_kg,targetWeight:profile.target_weight_kg})});success("个人资料已保存");}
    catch(error){setError(error instanceof Error?error.message:"保存失败");}finally{setSaving(false);}
  }
  async function saveGoal(){
    if(!goal)return;setSaving(true);setError("");
    try{await api("/api/goals/current",{method:"PUT",body:JSON.stringify({goalType:goal.goal_type,calories:goal.calories_kcal,protein:goal.protein_g,carbs:goal.carbohydrate_g,fat:goal.fat_g,water:goal.water_ml})});success("营养目标已更新");}
    catch(error){setError(error instanceof Error?error.message:"保存失败");}finally{setSaving(false);}
  }
  async function saveFood(){
    if(!editor)return;setSaving(true);setError("");
    try{
      const payload={...editor,serving:editor.serving_name,gramWeight:editor.gram_weight,carbohydrate:editor.carbohydrate,dietaryFiber:editor.dietary_fiber};
      await api("/api/custom-foods",{method:editor.id?"PATCH":"POST",body:JSON.stringify(payload)});
      setEditor(null);await load();success(editor.id?"私人食品已更新":"私人食品已创建");
    }catch(error){setError(error instanceof Error?error.message:"保存失败");}finally{setSaving(false);}
  }
  async function removeFood(id:number){
    if(!confirm("将此私人食品移到回收站？"))return;
    await api("/api/custom-foods",{method:"DELETE",body:JSON.stringify({id})});await load();success("已移到回收站");
  }
  async function restore(item:Trash){
    await api("/api/trash",{method:"POST",body:JSON.stringify({id:item.id,type:item.type})});await load();success("记录已恢复");
  }
  async function rollbackImport(batch:ImportBatch){
    if(!confirm(`撤销 ${batch.fileName} 的导入结果？此操作会恢复导入前数据。`))return;
    setSaving(true);setError("");
    try{await api(`/api/data-imports/${batch.id}/rollback`,{method:"POST"});await load();success("导入批次已安全撤销");}
    catch(error){setError(error instanceof Error?error.message:"撤销失败");}finally{setSaving(false);}
  }
  const field=(key:keyof Profile,value:string|number)=>setProfile(current=>current?{...current,[key]:value}:current);
  const goalField=(key:keyof Goal,value:string|number)=>setGoal(current=>current?{...current,[key]:value}:current);
  const foodField=(key:keyof CustomFood,value:string|number)=>setEditor(current=>({...current,[key]:value}));

  return <main className="manage-page">
    <header className="manage-header"><button onClick={()=>router.push("/")}><ArrowLeft/></button><div className="manage-brand"><Leaf fill="currentColor"/><strong>FitFuel</strong></div><div><p>DATA MANAGEMENT</p><h1>数据维护</h1></div></header>
    <div className="manage-layout">
      <aside className="manage-nav"><p>账户与数据</p>{manageTabs.map(({value,Icon,label})=><button key={value} className={tab===value?"active":""} onClick={()=>setTab(value)}><Icon size={17}/>{label}{value==="trash"&&trash.length>0?<i>{trash.length}</i>:null}</button>)}</aside>
      <section className="manage-content">
        {message&&<div className="global-message success"><Check/> {message}</div>}
        {error&&<div className="global-message error">{error}<button onClick={()=>setError("")}><X/></button></div>}
        {loading?<div className="page-loading"><LoaderCircle/> 正在加载你的数据…</div>:<>
          {tab==="profile"&&profile&&<div className="manage-section"><div className="manage-title"><span>PROFILE</span><h2>个人资料</h2><p>用于计算基础代谢和目标进度。</p></div><div className="manage-form">
            <label>登录邮箱<input value={profile.email} disabled/></label><label>昵称<input value={profile.display_name} onChange={e=>field("display_name",e.target.value)}/></label>
            <div className="form-pair"><label>身高（cm）<input type="number" value={profile.height_cm} onChange={e=>field("height_cm",+e.target.value)}/></label><label>年龄<input type="number" value={profile.age} onChange={e=>field("age",+e.target.value)}/></label></div>
            <label>性别<select value={profile.gender} onChange={e=>field("gender",e.target.value)}><option value="male">男性</option><option value="female">女性</option><option value="other">其他</option></select></label>
            <div className="form-pair"><label>初始体重（kg）<input type="number" step=".1" value={profile.initial_weight_kg} onChange={e=>field("initial_weight_kg",+e.target.value)}/></label><label>目标体重（kg）<input type="number" step=".1" value={profile.target_weight_kg} onChange={e=>field("target_weight_kg",+e.target.value)}/></label></div>
            <button className="manage-save" disabled={saving} onClick={saveProfile}><Save/> 保存资料</button>
          </div></div>}
          {tab==="goal"&&goal&&<div className="manage-section"><div className="manage-title"><span>DAILY TARGET</span><h2>营养目标</h2><p>首页的进度环会立即使用新的目标。</p></div><div className="manage-form">
            <label>目标类型<select value={goal.goal_type} onChange={e=>goalField("goal_type",e.target.value)}><option value="cut">减脂</option><option value="gain">增肌</option><option value="maintain">维持</option></select></label>
            <label>每日热量（kcal）<input type="number" value={goal.calories_kcal} onChange={e=>goalField("calories_kcal",+e.target.value)}/></label>
            <div className="form-pair"><label>蛋白质（g）<input type="number" value={goal.protein_g} onChange={e=>goalField("protein_g",+e.target.value)}/></label><label>碳水（g）<input type="number" value={goal.carbohydrate_g} onChange={e=>goalField("carbohydrate_g",+e.target.value)}/></label></div>
            <div className="form-pair"><label>脂肪（g）<input type="number" value={goal.fat_g} onChange={e=>goalField("fat_g",+e.target.value)}/></label><label>饮水量（ml）<input type="number" value={goal.water_ml} onChange={e=>goalField("water_ml",+e.target.value)}/></label></div>
            <button className="manage-save" disabled={saving} onClick={saveGoal}><Save/> 更新目标</button>
          </div></div>}
          {tab==="foods"&&<div className="manage-section wide"><div className="manage-title row"><div><span>PERSONAL LIBRARY</span><h2>私人食品</h2><p>共享 food_info 由管理员维护，这里的食品仅你可见。</p></div><button onClick={()=>setEditor({name:"",serving_name:"100g",gram_weight:100,calories:0,protein:0,carbohydrate:0,fat:0,dietary_fiber:0})}><Plus/> 创建食品</button></div>
            <div className="food-maintain-list">{foods.length?foods.map(food=><div key={food.id}><span className="food-dot">★</span><div><b>{food.name}</b><small>{food.brand||"私人食品"} · {food.serving_name}</small></div><span>{food.calories} kcal</span><span>P {food.protein}g</span><button onClick={()=>setEditor(food)}>编辑</button><button className="danger" onClick={()=>removeFood(food.id)}><Trash2/></button></div>):<div className="manage-empty"><CookingPot/><b>还没有私人食品</b><span>创建常吃的品牌食品或自制餐食。</span></div>}</div>
          </div>}
          {tab==="imports"&&<div className="manage-section wide"><div className="manage-title"><span>IMPORT AUDIT</span><h2>导入历史</h2><p>查看文件、处理状态与审计时间；仅最近一个有效批次可安全撤销。</p></div>
            <div className="import-history">{imports.length?imports.map((batch,index)=><div key={batch.id}><span className={`import-status ${batch.status}`}><History/></span><div><b>{batch.fileName}</b><small>{batch.format.toUpperCase()} · {batch.rowCount} 行 · {new Date(batch.createdAt).toLocaleString("zh-CN")}</small></div><em>{importStatusLabel(batch.status)}</em>{batch.status==="committed"&&index===imports.findIndex(item=>item.status==="committed")?<button disabled={saving} onClick={()=>void rollbackImport(batch)}><RefreshCcw/> 安全撤销</button>:<span className="history-note">{batch.status==="rolled_back"?"已恢复导入前数据":batch.status==="preview"?"等待提交":"—"}</span>}</div>):<div className="manage-empty"><History/><b>还没有导入记录</b><span>在统计页导入 Excel 或 CSV 后，批次会显示在这里。</span></div>}</div>
          </div>}
          {tab==="trash"&&<div className="manage-section wide"><div className="manage-title"><span>RECOVERY</span><h2>回收站</h2><p>软删除的数据可以安全恢复。</p></div><div className="trash-list">{trash.length?trash.map(item=><div key={`${item.type}-${item.id}`}><Trash2/><div><b>{item.name}</b><small>{typeLabel(item.type)} · {new Date(item.deleted_at).toLocaleString("zh-CN")}</small></div><button onClick={()=>restore(item)}><RefreshCcw/> 恢复</button></div>):<div className="manage-empty"><Check/><b>回收站为空</b><span>当前没有已删除的数据。</span></div>}</div></div>}
        </>}
      </section>
    </div>
    {editor&&<div className="record-backdrop" onMouseDown={()=>setEditor(null)}><aside className="record-drawer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><p>PERSONAL FOOD</p><h2>{editor.id?"编辑私人食品":"创建私人食品"}</h2><span>营养数据按设置的每份计算</span></div><button onClick={()=>setEditor(null)}><X/></button></div>
      <label>食品名称<div><input value={editor.name??""} onChange={e=>foodField("name",e.target.value)}/></div></label><label>品牌（可选）<div><input value={editor.brand??""} onChange={e=>foodField("brand",e.target.value)}/></div></label>
      <div className="form-pair"><label>份量名称<div><input value={editor.serving_name??"100g"} onChange={e=>foodField("serving_name",e.target.value)}/></div></label><label>克重<div><input type="number" value={editor.gram_weight??100} onChange={e=>foodField("gram_weight",+e.target.value)}/></div></label></div>
      <label>热量（kcal）<div><input type="number" value={editor.calories??0} onChange={e=>foodField("calories",+e.target.value)}/></div></label>
      <div className="form-pair"><label>蛋白质（g）<div><input type="number" value={editor.protein??0} onChange={e=>foodField("protein",+e.target.value)}/></div></label><label>碳水（g）<div><input type="number" value={editor.carbohydrate??0} onChange={e=>foodField("carbohydrate",+e.target.value)}/></div></label></div>
      <div className="form-pair"><label>脂肪（g）<div><input type="number" value={editor.fat??0} onChange={e=>foodField("fat",+e.target.value)}/></div></label><label>膳食纤维（g）<div><input type="number" value={editor.dietary_fiber??0} onChange={e=>foodField("dietary_fiber",+e.target.value)}/></div></label></div>
      <button className="save-record" disabled={saving} onClick={saveFood}>{saving?"正在保存…":"保存私人食品"}</button>
    </aside></div>}
  </main>;
}

function typeLabel(type:string){return {custom_food:"私人食品",meal_item:"餐食记录",daily_record:"每日记录",water:"饮水记录"}[type]??type}
function importStatusLabel(status:string){return {preview:"待提交",committed:"已导入",rolled_back:"已撤销"}[status]??status}
