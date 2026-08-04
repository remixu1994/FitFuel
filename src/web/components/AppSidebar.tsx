"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, CalendarDays, ClipboardList, Dumbbell, Leaf, LogOut, Menu,
  ScanLine, Settings, ShieldCheck, X, History
} from "lucide-react";
import { api } from "@/web/client/client";

export type SidebarUser = {
  email: string;
  displayName: string;
  role: string;
};

const navigation = [
  { href: "/", label: "今日饮食", Icon: CalendarDays },
  { href: "/records", label: "饮食记录", Icon: ClipboardList },
  { href: "/activity", label: "运动消耗", Icon: Dumbbell },
  { href: "/activity/history", label: "运动记录", Icon: History },
  { href: "/sync/elevatine", label: "AI 识别记录", Icon: ScanLine, badge: "AI" },
  { href: "/calendar", label: "统计", Icon: BarChart3 },
  { href: "/settings", label: "设置", Icon: Settings }
] as const;

export function AppSidebar({ user: suppliedUser }: { user?: SidebarUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadedUser, setLoadedUser] = useState<SidebarUser | null>(suppliedUser ?? null);

  useEffect(() => {
    if (suppliedUser) {
      setLoadedUser(suppliedUser);
      return;
    }
    if (suppliedUser === undefined) {
      api<{ user: SidebarUser }>("/api/auth/session")
        .then(result => setLoadedUser(result.user))
        .catch(() => undefined);
    }
  }, [suppliedUser]);

  function navigate(href: string) {
    setMenuOpen(false);
    router.push(href);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  function active(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/activity") return pathname === "/activity";
    return pathname.startsWith(href);
  }

  return <>
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="brand">
        <span className="brandmark"><Leaf size={24} fill="currentColor"/></span>
        <div><strong>FitFuel</strong><small>Fuel Your Best Body</small></div>
      </div>
      <nav aria-label="主菜单">
        {navigation.map(({ href, label, Icon, ...item }) => (
          <button key={href} className={active(href) ? "active" : ""} onClick={() => navigate(href)}>
            <Icon size={18}/><span>{label}</span>{"badge" in item && <i>{item.badge}</i>}
          </button>
        ))}
        {loadedUser?.role === "admin" && (
          <button className={active("/admin") ? "active" : ""} onClick={() => navigate("/admin")}>
            <ShieldCheck size={18}/><span>管理后台</span><i>ADMIN</i>
          </button>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-card">
          <div className="avatar">{loadedUser?.displayName?.[0]?.toUpperCase() ?? "U"}</div>
          <div className="profile-info">
            <div><b>{loadedUser?.displayName ?? "用户"}</b><em>{loadedUser?.role === "admin" ? "ADMIN" : "PRO"}</em></div>
            <small>{loadedUser?.email ?? "正在读取账户…"}</small><span><i/></span>
          </div>
        </div>
        <button className="logout-button" onClick={logout}><LogOut size={15}/> 退出登录</button>
      </div>
    </aside>
    <button className="mobile-menu" aria-label={menuOpen ? "关闭菜单" : "打开菜单"} onClick={() => setMenuOpen(!menuOpen)}>
      {menuOpen ? <X/> : <Menu/>}
    </button>
    {menuOpen && <div className="menu-scrim" onClick={() => setMenuOpen(false)}/>}
  </>;
}
