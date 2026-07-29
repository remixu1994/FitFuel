"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, Mail } from "lucide-react";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [visible,setVisible]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function submit(event:React.FormEvent){
    event.preventDefault();setLoading(true);setError("");
    try{
      const result=await api<{user:{mustChangePassword:boolean}}>("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(result.user.mustChangePassword?"/change-password":next||"/");router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"登录失败");}
    finally{setLoading(false);}
  }
  return <main className="auth-page">
    <section className="auth-visual">
      <div className="auth-brand"><Leaf fill="currentColor"/><strong>FitFuel</strong></div>
      <div className="auth-copy"><span>YOUR PERSONAL NUTRITION LOOP</span><h1>每一次记录，<br/>都让目标更近一步。</h1><p>把饮食、活动和体重放在同一个反馈系统里，找到真正适合你的节奏。</p></div>
      <div className="auth-orbit"><i/><i/><i/><div><b>1784</b><span>今日目标 kcal</span></div></div>
      <small>AI + 健身场景 + 个性化营养规划</small>
    </section>
    <section className="auth-form-side">
      <form className="auth-form" onSubmit={submit}>
        <p>WELCOME BACK</p><h2>登录 FitFuel</h2><span>继续记录今天的饮食和身体状态</span>
        {error&&<div className="form-error">{error}</div>}
        <label>邮箱<div><Mail/><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" required/></div></label>
        <label>密码<div><LockKeyhole/><input type={visible?"text":"password"} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 8 位密码" required/><button type="button" onClick={()=>setVisible(!visible)}>{visible?<EyeOff/>:<Eye/>}</button></div></label>
        <button className="auth-submit" disabled={loading}>{loading?"正在登录…":<>登录 <ArrowRight/></>}</button>
        <div className="auth-switch">账号由管理员统一创建，如需开通请联系管理员。</div>
      </form>
    </section>
  </main>;
}
