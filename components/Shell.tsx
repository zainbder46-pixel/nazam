"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sun, Moon, LayoutDashboard, ListTodo, FileText, HandHeart, Wallet, Users, Plus, LogOut, ChevronDown, Check, Bell, Star,
} from "lucide-react";
import { useApp } from "./AppProvider";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { QuickAdd } from "./QuickAdd";
import type { Page } from "@/lib/types";

const NAV = [
  { href: "/", label: "اليوم", icon: LayoutDashboard },
  { href: "/tasks", label: "المهام", icon: ListTodo },
  { href: "/pages", label: "الصفحات", icon: FileText },
  { href: "/faith", label: "العبادات", icon: HandHeart },
  { href: "/finance", label: "المالية", icon: Wallet },
  { href: "/spaces", label: "المساحات", icon: Users },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile, email, workspaces, ws, setWsId, invites, setQuickAddOpen, canEdit } = useApp();
  const [wsOpen, setWsOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [pages, setPages] = useState<Pick<Page, "id" | "title" | "icon" | "is_favorite">[]>([]);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  useEffect(() => {
    if (!ws) return;
    supabase().from("pages").select("id,title,icon,is_favorite").eq("workspace_id", ws.id).is("parent_id", null)
      .order("is_favorite", { ascending: false }).order("position").limit(12)
      .then(({ data }) => setPages(data ?? []));
  }, [ws, path]);

  const toggleTheme = () => {
    const next = !dark; setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  const logout = async () => { await supabase().auth.signOut(); router.replace("/login"); router.refresh(); };
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* الشريط الجانبي */}
      <aside className="hidden lg:flex flex-col h-screen sticky top-0 border-l border-line bg-surface/60 backdrop-blur p-3">
        {/* مبدّل المساحات */}
        <div className="relative mb-3">
          <button onClick={() => setWsOpen(!wsOpen)} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-ink/5 transition">
            <span className="h-8 w-8 rounded-lg flex items-center justify-center text-lg" style={{ background: (ws?.color ?? "#0f766e") + "22" }}>{ws?.icon ?? "🏠"}</span>
            <span className="flex-1 text-right min-w-0">
              <span className="block text-sm font-semibold truncate">{ws?.name ?? "..."}</span>
              <span className="block text-[11px] text-muted">{ws?.is_personal ? "مساحة شخصية" : ws?.role === "owner" ? "مساحة مشتركة · مالك" : ws?.role === "editor" ? "مساحة مشتركة · محرر" : "مساحة مشتركة · مشاهد"}</span>
            </span>
            <ChevronDown size={16} className="text-muted" />
          </button>
          {wsOpen && (
            <div className="absolute z-30 top-full mt-1 inset-x-0 card p-1.5 anim-pop">
              {workspaces.map((w) => (
                <button key={w.id} onClick={() => { setWsId(w.id); setWsOpen(false); }}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5">
                  <span>{w.icon}</span><span className="flex-1 text-right truncate">{w.name}</span>
                  {w.id === ws?.id && <Check size={14} className="text-brand" />}
                </button>
              ))}
              <Link href="/spaces" onClick={() => setWsOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-brand hover:bg-ink/5 border-t border-line mt-1 pt-2">
                <Plus size={14} /> مساحة جديدة
              </Link>
            </div>
          )}
        </div>

        <button onClick={() => setQuickAddOpen(true)} disabled={!canEdit} className="btn-primary w-full mb-3">
          <Plus size={16} /> إضافة سريعة <kbd className="mr-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">N</kbd>
        </button>

        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={cn("flex items-center gap-3 rounded-xl px-3 h-10 text-sm transition", active(n.href) ? "bg-brand/10 text-brand font-semibold" : "text-ink/80 hover:bg-ink/5")}>
              <n.icon size={18} /> {n.label}
              {n.href === "/spaces" && invites.length > 0 && <span className="mr-auto chip bg-gold text-white">{invites.length}</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-5 flex-1 overflow-y-auto">
          <p className="px-3 text-[11px] font-semibold text-muted mb-1">صفحات {ws?.is_personal ? "مساحتي" : ws?.name}</p>
          {pages.map((p) => (
            <Link key={p.id} href={`/pages/${p.id}`}
              className={cn("flex items-center gap-2 rounded-lg px-3 h-8 text-sm truncate transition", path === `/pages/${p.id}` ? "bg-ink/5 font-medium" : "text-ink/70 hover:bg-ink/5")}>
              <span>{p.icon}</span><span className="truncate flex-1">{p.title}</span>
              {p.is_favorite && <Star size={12} className="text-gold fill-gold" />}
            </Link>
          ))}
        </div>

        <div className="border-t border-line pt-3 flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gold/20 text-gold flex items-center justify-center text-sm font-bold">
            {(profile?.full_name ?? email)[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.full_name ?? "..."}</p>
            <p className="text-[11px] text-muted truncate" dir="ltr">{email}</p>
          </div>
          <button className="icon-btn" onClick={toggleTheme} title="الوضع">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="icon-btn" onClick={logout} title="خروج"><LogOut size={16} /></button>
        </div>
      </aside>

      {/* الجوال: شريط علوي */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-2 px-4 h-14 bg-bg/80 backdrop-blur border-b border-line">
        <select value={ws?.id ?? ""} onChange={(e) => setWsId(e.target.value)} className="bg-transparent font-semibold text-sm outline-none max-w-[55%]">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
        </select>
        <div className="mr-auto flex items-center">
          {invites.length > 0 && <Link href="/spaces" className="icon-btn text-gold"><Bell size={18} /></Link>}
          <button className="icon-btn" onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-btn" onClick={logout}><LogOut size={18} /></button>
        </div>
      </header>

      <main className="min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 pb-28 lg:pb-10 max-w-6xl w-full mx-auto">{children}</main>

      {/* الجوال: شريط سفلي */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line grid grid-cols-6 px-1 pb-[env(safe-area-inset-bottom)]">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", active(n.href) ? "text-brand font-semibold" : "text-muted")}>
            <n.icon size={20} /> {n.label}
          </Link>
        ))}
      </nav>
      {canEdit && (
        <button onClick={() => setQuickAddOpen(true)} className="lg:hidden fixed bottom-20 left-4 z-30 h-14 w-14 rounded-2xl bg-brand text-white shadow-xl flex items-center justify-center">
          <Plus size={26} />
        </button>
      )}

      <QuickAdd />
    </div>
  );
}
