"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, Copy, ImagePlus, KeyRound, Leaf, LoaderCircle, Plus, Power,
  RefreshCcw, Search, ShieldCheck, UserRound, UsersRound, X
} from "lucide-react";
import { api } from "@/lib/client";

type ManagedUser = {
  id:number;email:string;display_name:string;role:string;status:number;
  must_change_password:boolean;last_login_at?:string;created_at:string;
  height_cm:number;age:number;gender:string;initial_weight_kg:number;target_weight_kg:number;
};
type UserForm = {
  email:string;displayName:string;temporaryPassword:string;height:number;age:number;
  gender:string;currentWeight:number;targetWeight:number;
};
type SharedFood={id:number;name:string;serving:string;gram_weight:number;calories:number;protein:number;carbohydrate:number;fat:number;dietary_fiber:number};
type FoodCandidate=SharedFood & {confidence:number;quantity:number;unit:string};

const emptyForm:UserForm={
  email:"",displayName:"",temporaryPassword:"",height:175,age:30,
  gender:"other",currentWeight:70,targetWeight:65
};

export default function AdminPage(){
  const router=useRouter();
  const [adminTab,setAdminTab]=useState<"users"|"foods">("users");
  const [users,setUsers]=useState<ManagedUser[]>([]);
  const [editor,setEditor]=useState<UserForm|null>(null);
  const [temporaryPassword,setTemporaryPassword]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [foods,setFoods]=useState<SharedFood[]>([]);
  const [foodQuery,setFoodQuery]=useState("");
  const [foodCandidate,setFoodCandidate]=useState<FoodCandidate|null>(null);
  const [foodFile,setFoodFile]=useState<File|null>(null);
  const [foodParsing,setFoodParsing]=useState(false);
  const [foodDragging,setFoodDragging]=useState(false);
  const [foodFeedback,setFoodFeedback]=useState<""|"saving"|"success"|"error">("");

  async function load(){
    setLoading(true);setError("");
    try{
      const session=await api<{user:{role:string}}>("/api/auth/session");
      if(session.user.role!=="admin"){router.replace("/");return;}
      if(adminTab==="users"){
        const result=await api<{users:ManagedUser[]}>("/api/admin/users");
        setUsers(result.users);
      }else{
        const foodResult=await api<{foods:SharedFood[]}>(`/api/admin/foods?q=${encodeURIComponent(foodQuery)}`);
        setFoods(foodResult.foods);
      }
    }catch(error){setError(error instanceof Error?error.message:"管理员数据加载失败");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[adminTab,foodQuery]);
  const field=(key:keyof UserForm,value:string|number)=>setEditor(current=>current?{...current,[key]:value}:current);
  const success=(text:string)=>{setMessage(text);setTimeout(()=>setMessage(""),2500);};

  async function createUser(){
    if(!editor)return;setSaving(true);setError("");
    try{
      const result=await api<{temporaryPassword:string}>("/api/admin/users",{
        method:"POST",body:JSON.stringify(editor)
      });
      setTemporaryPassword(result.temporaryPassword);setEditor(null);await load();success("普通用户已创建");
    }catch(error){setError(error instanceof Error?error.message:"创建用户失败");}
    finally{setSaving(false);}
  }

  async function toggleUser(user:ManagedUser){
    const action=user.status===1?"停用":"启用";
    if(!confirm(`${action}账号 ${user.email}？`))return;
    try{
      await api(`/api/admin/users/${user.id}`,{
        method:"PATCH",body:JSON.stringify({status:user.status===1?0:1})
      });
      await load();success(`账号已${action}`);
    }catch(error){setError(error instanceof Error?error.message:`${action}失败`);}
  }

  async function resetPassword(user:ManagedUser){
    if(!confirm(`为 ${user.email} 生成新的临时密码并注销其现有会话？`))return;
    try{
      const result=await api<{temporaryPassword:string}>(`/api/admin/users/${user.id}/reset-password`,{
        method:"POST",body:"{}"
      });
      setTemporaryPassword(result.temporaryPassword);await load();success("临时密码已重置");
    }catch(error){setError(error instanceof Error?error.message:"密码重置失败");}
  }

  async function copyPassword(){
    await navigator.clipboard.writeText(temporaryPassword);success("临时密码已复制");
  }
  function foodField(key:keyof FoodCandidate,value:string|number){setFoodCandidate(current=>current?{...current,[key]:value}:current);}
  async function parseFoodImage(file:File|null){
    setFoodFile(file);setFoodCandidate(null);setFoodFeedback("");if(!file)return;setFoodParsing(true);setError("");
    try{const body=new FormData();body.append("image",file);const result=await api<{candidate:FoodCandidate}>("/api/custom-foods/image-preview",{method:"POST",body});setFoodCandidate({...result.candidate,id:0,serving:result.candidate.unit,gram_weight:result.candidate.quantity});}
    catch(error){setError(error instanceof Error?error.message:"图片识别失败");}finally{setFoodParsing(false);}
  }
  async function saveSharedFood(){
    if(!foodCandidate)return;setSaving(true);setFoodFeedback("saving");setError("");
    try{await api("/api/admin/foods",{method:"POST",body:JSON.stringify(foodCandidate)});setFoodCandidate(null);setFoodFile(null);setFoodFeedback("success");success("共享食品已更新");await load();}
    catch(error){setFoodFeedback("error");setError(error instanceof Error?error.message:"食品保存失败");}finally{setSaving(false);}
  }
  function editSharedFood(food:SharedFood){
    setFoodFeedback("");
    setFoodCandidate({...food,confidence:1,quantity:food.gram_weight,unit:food.serving});
  }

  return <main className="admin-page">
    <header className="manage-header">
      <button onClick={()=>router.push("/")}><ArrowLeft/></button>
      <div className="manage-brand"><Leaf fill="currentColor"/><strong>FitFuel</strong></div>
      <div><p>ADMIN CONSOLE</p><h1>管理后台</h1></div>
      <span className="admin-identity"><ShieldCheck/> Remi · 唯一管理员</span>
    </header>
    <section className="admin-content">
      <nav className="admin-subnav" aria-label="管理后台菜单"><button className={adminTab==="users"?"active":""} onClick={()=>setAdminTab("users")}><UsersRound/> 用户账号管理</button><button className={adminTab==="foods"?"active":""} onClick={()=>setAdminTab("foods")}><ImagePlus/> 食品信息维护</button></nav>
      {adminTab==="users"&&<div className="admin-title">
        <div><span>ACCOUNT CONTROL</span><h2>用户账号</h2><p>创建普通用户、控制访问状态并管理临时密码。</p></div>
        <button onClick={()=>setEditor({...emptyForm})}><Plus/> 创建用户</button>
      </div>}
      {message&&<div className="global-message success"><Check/> {message}</div>}
      {error&&<div className="global-message error">{error}<button onClick={()=>setError("")}><X/></button></div>}
      {temporaryPassword&&<div className="temporary-secret"><KeyRound/><div><b>临时密码仅显示一次</b><code>{temporaryPassword}</code><span>用户首次登录后必须立即修改。</span></div><button onClick={copyPassword}><Copy/> 复制</button><button className="secret-close" onClick={()=>setTemporaryPassword("")}><X/></button></div>}
      {adminTab==="users"&&(loading?<div className="page-loading"><LoaderCircle/> 正在加载账号…</div>:<div className="admin-users">
        <div className="admin-table-head"><span>用户</span><span>角色</span><span>状态</span><span>最近登录</span><span>操作</span></div>
        {users.map(user=><div className="admin-user-row" key={user.id}>
          <div className="admin-user"><span>{user.display_name[0]?.toUpperCase()}</span><div><b>{user.display_name}</b><small>{user.email}</small></div></div>
          <span className={`role-badge ${user.role}`}>{user.role==="admin"?"管理员":"普通用户"}</span>
          <span className={`status-badge ${user.status===1?"active":"disabled"}`}>{user.status===1?(user.must_change_password?"待修改密码":"正常"):"已停用"}</span>
          <span className="last-login">{user.last_login_at?new Date(user.last_login_at).toLocaleString("zh-CN"):"从未登录"}</span>
          <div className="row-actions">{user.role==="user"?<><button onClick={()=>resetPassword(user)}><RefreshCcw/> 重置密码</button><button className={user.status===1?"danger":""} onClick={()=>toggleUser(user)}><Power/> {user.status===1?"停用":"启用"}</button></>:<span>受保护</span>}</div>
        </div>)}
        {!users.length&&<div className="manage-empty"><UsersRound/><b>暂无用户</b></div>}
      </div>)}
      {adminTab==="foods"&&<section className="admin-food-maintain">
        <div className="admin-title"><div><span>SHARED FOOD LIBRARY</span><h2>食品信息维护</h2><p>图片录入和食品搜索分开管理，所有修改提交前都可以手动校对。</p></div></div>
        <section className="admin-food-entry"><div className="admin-food-section-title"><div><span>IMAGE ENTRY</span><h3>图片录入 / 更新</h3><p>上传 Elavatine 食物详情图，识别后编辑并保存。</p></div></div>{foodFeedback==="success"&&<p className="admin-food-feedback success">✓ 保存成功，食品库已更新</p>}{foodFeedback==="error"&&<p className="admin-food-feedback error">保存失败，请检查错误提示后重试</p>}<div className="admin-food-tools"><label className={`admin-food-upload ${foodDragging?"dragging":""}`} onDragOver={event=>{event.preventDefault();setFoodDragging(true)}} onDragLeave={()=>setFoodDragging(false)} onDrop={event=>{event.preventDefault();setFoodDragging(false);const file=event.dataTransfer.files?.[0];if(file&&!file.type.startsWith("image/")){setError("请上传 JPG、PNG 或 WebP 图片");return}void parseFoodImage(file??null)}}><ImagePlus/> <span>{foodParsing?"识别中…":foodDragging?"松开以上传详情图":"拖拽图片到这里，或点击选择"}</span><small>支持 JPEG、PNG、WebP，最大 10 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void parseFoodImage(e.target.files?.[0]??null)}/></label></div>
          {foodCandidate&&<div className="admin-food-editor"><div className="form-pair"><label>食品名称<input value={foodCandidate.name} onChange={e=>foodField("name",e.target.value)}/></label><label>单位<input value={foodCandidate.serving} onChange={e=>foodField("serving",e.target.value)}/></label></div><div className="form-pair"><label>数量/克重<input type="number" value={foodCandidate.gram_weight} onChange={e=>foodField("gram_weight",+e.target.value)}/></label><label>热量 kcal<input type="number" value={foodCandidate.calories} onChange={e=>foodField("calories",+e.target.value)}/></label></div><div className="form-pair"><label>碳水 g<input type="number" value={foodCandidate.carbohydrate??0} onChange={e=>foodField("carbohydrate",+e.target.value)}/></label><label>蛋白质 g<input type="number" value={foodCandidate.protein??0} onChange={e=>foodField("protein",+e.target.value)}/></label></div><div className="form-pair"><label>脂肪 g<input type="number" value={foodCandidate.fat??0} onChange={e=>foodField("fat",+e.target.value)}/></label><label>膳食纤维 g<input type="number" value={foodCandidate.dietary_fiber??0} onChange={e=>foodField("dietary_fiber",+e.target.value)}/></label></div><button className="save-record" disabled={saving} onClick={()=>void saveSharedFood()}>{saving?"正在保存…":"确认更新共享食品"}</button>{foodFeedback==="saving"&&<p className="admin-food-feedback saving">正在保存食品数据…</p>}{foodFeedback==="success"&&<p className="admin-food-feedback success">✓ 保存成功，食品库已更新</p>}{foodFeedback==="error"&&<p className="admin-food-feedback error">保存失败，请检查上方错误提示后重试</p>}</div>}
        </section>
        <section className="admin-food-search"><div className="admin-food-section-title"><div><span>FOOD SEARCH</span><h3>搜索食品</h3><p>按名称查找共享食品，支持直接手动更新营养数据。</p></div></div><div className="admin-food-tools"><div className="searchbox"><Search/><input value={foodQuery} onChange={e=>setFoodQuery(e.target.value)} placeholder="搜索食品名称"/></div></div><div className="admin-food-list"><div className="admin-food-list-head"><span>食品名称</span><span>单位</span><span>热量</span><span>碳水</span><span>蛋白质</span><span>脂肪</span><span>操作</span></div>{foods.slice(0,12).map(food=><div key={food.id}><b>{food.name}</b><span>{food.serving}</span><span>{food.calories} kcal</span><span>{food.carbohydrate} g</span><span>{food.protein} g</span><span>{food.fat} g</span><button onClick={()=>editSharedFood(food)}>编辑</button></div>)}</div></section>
      </section>}
    </section>
    {editor&&<div className="record-backdrop" onMouseDown={()=>setEditor(null)}><aside className="record-drawer" onMouseDown={e=>e.stopPropagation()}>
      <div className="drawer-head"><div><p>NEW ACCOUNT</p><h2>创建普通用户</h2><span>创建后首次登录必须修改临时密码</span></div><button onClick={()=>setEditor(null)}><X/></button></div>
      <label>昵称<div><UserRound/><input value={editor.displayName} onChange={e=>field("displayName",e.target.value)}/></div></label>
      <label>邮箱<div><input type="email" value={editor.email} onChange={e=>field("email",e.target.value)}/></div></label>
      <label>临时密码（可留空自动生成）<div><KeyRound/><input type="text" value={editor.temporaryPassword} onChange={e=>field("temporaryPassword",e.target.value)} placeholder="至少 12 位"/></div></label>
      <div className="form-pair"><label>身高（cm）<div><input type="number" value={editor.height} onChange={e=>field("height",+e.target.value)}/></div></label><label>年龄<div><input type="number" value={editor.age} onChange={e=>field("age",+e.target.value)}/></div></label></div>
      <label>性别<div><select value={editor.gender} onChange={e=>field("gender",e.target.value)}><option value="male">男性</option><option value="female">女性</option><option value="other">其他</option></select></div></label>
      <div className="form-pair"><label>当前体重（kg）<div><input type="number" step=".1" value={editor.currentWeight} onChange={e=>field("currentWeight",+e.target.value)}/></div></label><label>目标体重（kg）<div><input type="number" step=".1" value={editor.targetWeight} onChange={e=>field("targetWeight",+e.target.value)}/></div></label></div>
      <button className="save-record" disabled={saving} onClick={createUser}>{saving?"正在创建…":"创建普通用户"}</button>
    </aside></div>}
  </main>;
}
