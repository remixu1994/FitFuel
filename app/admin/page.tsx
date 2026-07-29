"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, Copy, KeyRound, Leaf, LoaderCircle, Plus, Power,
  RefreshCcw, ShieldCheck, UserRound, UsersRound, X
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

const emptyForm:UserForm={
  email:"",displayName:"",temporaryPassword:"",height:175,age:30,
  gender:"other",currentWeight:70,targetWeight:65
};

export default function AdminPage(){
  const router=useRouter();
  const [users,setUsers]=useState<ManagedUser[]>([]);
  const [editor,setEditor]=useState<UserForm|null>(null);
  const [temporaryPassword,setTemporaryPassword]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const [session,result]=await Promise.all([
        api<{user:{role:string}}>("/api/auth/session"),
        api<{users:ManagedUser[]}>("/api/admin/users")
      ]);
      if(session.user.role!=="admin"){router.replace("/");return;}
      setUsers(result.users);
    }catch(error){setError(error instanceof Error?error.message:"管理员数据加载失败");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
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

  return <main className="admin-page">
    <header className="manage-header">
      <button onClick={()=>router.push("/")}><ArrowLeft/></button>
      <div className="manage-brand"><Leaf fill="currentColor"/><strong>FitFuel</strong></div>
      <div><p>ADMIN CONSOLE</p><h1>管理后台</h1></div>
      <span className="admin-identity"><ShieldCheck/> Remi · 唯一管理员</span>
    </header>
    <section className="admin-content">
      <div className="admin-title">
        <div><span>ACCOUNT CONTROL</span><h2>用户账号</h2><p>创建普通用户、控制访问状态并管理临时密码。</p></div>
        <button onClick={()=>setEditor({...emptyForm})}><Plus/> 创建用户</button>
      </div>
      {message&&<div className="global-message success"><Check/> {message}</div>}
      {error&&<div className="global-message error">{error}<button onClick={()=>setError("")}><X/></button></div>}
      {temporaryPassword&&<div className="temporary-secret"><KeyRound/><div><b>临时密码仅显示一次</b><code>{temporaryPassword}</code><span>用户首次登录后必须立即修改。</span></div><button onClick={copyPassword}><Copy/> 复制</button><button className="secret-close" onClick={()=>setTemporaryPassword("")}><X/></button></div>}
      {loading?<div className="page-loading"><LoaderCircle/> 正在加载账号…</div>:<div className="admin-users">
        <div className="admin-table-head"><span>用户</span><span>角色</span><span>状态</span><span>最近登录</span><span>操作</span></div>
        {users.map(user=><div className="admin-user-row" key={user.id}>
          <div className="admin-user"><span>{user.display_name[0]?.toUpperCase()}</span><div><b>{user.display_name}</b><small>{user.email}</small></div></div>
          <span className={`role-badge ${user.role}`}>{user.role==="admin"?"管理员":"普通用户"}</span>
          <span className={`status-badge ${user.status===1?"active":"disabled"}`}>{user.status===1?(user.must_change_password?"待修改密码":"正常"):"已停用"}</span>
          <span className="last-login">{user.last_login_at?new Date(user.last_login_at).toLocaleString("zh-CN"):"从未登录"}</span>
          <div className="row-actions">{user.role==="user"?<><button onClick={()=>resetPassword(user)}><RefreshCcw/> 重置密码</button><button className={user.status===1?"danger":""} onClick={()=>toggleUser(user)}><Power/> {user.status===1?"停用":"启用"}</button></>:<span>受保护</span>}</div>
        </div>)}
        {!users.length&&<div className="manage-empty"><UsersRound/><b>暂无用户</b></div>}
      </div>}
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
