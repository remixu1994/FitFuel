"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Leaf, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    void api<{user:{mustChangePassword:boolean}|null}>("/api/auth/session")
      .then(({user})=>{if(!user)router.replace("/login");else if(!user.mustChangePassword)router.replace("/");})
      .catch(()=>router.replace("/login"));
  },[router]);

  async function submit(event:React.FormEvent){
    event.preventDefault();setError("");
    if(newPassword!==confirmPassword){setError("两次输入的新密码不一致");return;}
    setLoading(true);
    try{
      await api("/api/auth/change-password",{
        method:"POST",
        body:JSON.stringify({currentPassword,newPassword})
      });
      router.replace("/");router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"密码更新失败");}
    finally{setLoading(false);}
  }

  return <main className="auth-page password-page">
    <section className="auth-visual">
      <div className="auth-brand"><Leaf fill="currentColor"/><strong>FitFuel</strong></div>
      <div className="auth-copy"><span>SECURE YOUR ACCOUNT</span><h1>设置自己的密码，<br/>再开始记录。</h1><p>临时密码只用于首次登录。更新后，其他登录会话会自动失效。</p></div>
      <div className="auth-orbit password-orbit"><ShieldCheck/><div><b>1</b><span>次安全更新</span></div></div>
      <small>密码仅保存 Argon2id 哈希</small>
    </section>
    <section className="auth-form-side"><form className="auth-form" onSubmit={submit}>
      <p>FIRST SIGN-IN</p><h2>修改临时密码</h2><span>新密码长度为 12–128 位</span>
      {error&&<div className="form-error">{error}</div>}
      <label>当前临时密码<div><KeyRound/><input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/></div></label>
      <label>新密码<div><LockKeyhole/><input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></div></label>
      <label>确认新密码<div><LockKeyhole/><input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></div></label>
      <button className="auth-submit" disabled={loading}>{loading?"正在更新…":<>保存并继续 <ArrowRight/></>}</button>
    </form></section>
  </main>;
}
