"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Crown, LogOut, Mail, Plus, Trash2, X } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Modal, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Invite, Member, Profile, Role, Workspace } from "@/lib/types";

const ICONS = ["🏢", "💼", "🚀", "👨‍👩‍👧", "🤝", "📣", "🏠", "🎯", "⚽", "🎬", "📚", "🕌", "💡", "🛒", "🏗️", "✈️"];
const COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#b45309", "#16a34a", "#475569"];
const ROLES: Record<Role, string> = { owner: "مالك", editor: "محرر", viewer: "مشاهد" };

export default function SpacesPage() {
  const { workspaces, ws, setWsId, invites, reloadInvites, reloadWorkspaces, userId, profile, updateProfile } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const selected = workspaces.find((w) => w.id === (sel ?? ws?.id)) ?? null;

  const respond = async (inv: Invite, accept: boolean) => {
    await supabase().rpc("respond_invite", { invite: inv.id, accept });
    await Promise.all([reloadInvites(), reloadWorkspaces()]);
    if (accept) setWsId(inv.workspace_id);
  };

  return (
    <div>
      <PageHeader title="المساحات" subtitle="مساحتك الشخصية + مساحات مشتركة مع فريقك أو أهلك"
        actions={<button className="btn-primary" onClick={() => setCreate(true)}><Plus size={16} /> مساحة مشتركة</button>} />

      {invites.length > 0 && (
        <section className="card p-4 mb-6 border-gold/40 bg-gold/5">
          <h3 className="font-semibold mb-3">📨 دعوات بانتظارك</h3>
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface border border-line p-3">
                <span className="text-2xl">{i.workspace?.icon ?? "📁"}</span>
                <div className="flex-1"><p className="font-medium">{i.workspace?.name ?? "مساحة"}</p><p className="text-xs text-muted">كـ {ROLES[i.role]}</p></div>
                <button className="btn-primary h-9" onClick={() => respond(i, true)}><Check size={15} /> قبول</button>
                <button className="btn-outline h-9" onClick={() => respond(i, false)}>رفض</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        <div className="space-y-2">
          {workspaces.map((w) => (
            <button key={w.id} onClick={() => setSel(w.id)}
              className={cn("w-full flex items-center gap-3 rounded-2xl border p-3 text-right transition", selected?.id === w.id ? "bg-surface border-brand/40 shadow-soft" : "border-line hover:bg-ink/[.03]")}>
              <span className="h-10 w-10 rounded-xl flex items-center justify-center text-xl" style={{ background: w.color + "22" }}>{w.icon}</span>
              <div className="flex-1 min-w-0"><p className="font-medium truncate">{w.name}</p><p className="text-[11px] text-muted">{w.is_personal ? "شخصية · خاصة بك" : ROLES[w.role ?? "viewer"]}</p></div>
              {ws?.id === w.id && <span className="chip bg-brand/10 text-brand">الحالية</span>}
            </button>
          ))}
        </div>

        {selected && <SpaceDetail key={selected.id} w={selected} userId={userId} onSwitch={() => setWsId(selected.id)} isCurrent={ws?.id === selected.id}
          onChanged={reloadWorkspaces} onGone={async () => { setSel(null); await reloadWorkspaces(); }} />}
      </div>

      <section className="card p-5 mt-8 max-w-xl">
        <h3 className="font-semibold mb-4">⚙️ إعداداتي</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">الاسم</label><input className="input" defaultValue={profile?.full_name ?? ""} onBlur={(e) => e.target.value && updateProfile({ full_name: e.target.value })} /></div>
          <div><label className="label">العملة</label><input className="input" defaultValue={profile?.currency ?? "ر.س"} onBlur={(e) => e.target.value && updateProfile({ currency: e.target.value })} /></div>
        </div>
      </section>

      <CreateSpace open={create} onClose={() => setCreate(false)} userId={userId} onCreated={async (id) => { await reloadWorkspaces(); setWsId(id); setSel(id); setCreate(false); }} />
    </div>
  );
}

function SpaceDetail({ w, userId, onSwitch, isCurrent, onChanged, onGone }: {
  w: Workspace; userId: string; onSwitch: () => void; isCurrent: boolean; onChanged: () => void; onGone: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sent, setSent] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isOwner = w.role === "owner";

  const load = async () => {
    const sb = supabase();
    const { data: m } = await sb.from("workspace_members").select("*").eq("workspace_id", w.id);
    const ids = (m ?? []).map((x: Member) => x.user_id);
    const { data: p } = ids.length ? await sb.from("profiles").select("*").in("id", ids) : { data: [] };
    setMembers((m ?? []).map((x: Member) => ({ ...x, profile: (p ?? []).find((pp: Profile) => pp.id === x.user_id) })));
    const { data: inv } = await sb.from("workspace_invites").select("*").eq("workspace_id", w.id).eq("status", "pending");
    setSent(inv ?? []);
  };
  useEffect(() => { load(); }, [w.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return;
    if (members.some((m) => m.profile?.email?.toLowerCase() === e)) { setMsg("هذا الشخص عضو أصلًا"); return; }
    const { error } = await supabase().from("workspace_invites").insert({ workspace_id: w.id, email: e, role, invited_by: userId });
    setMsg(error ? error.message : "تم إرسال الدعوة ✅ أرسل له رابط الموقع ليسجّل بنفس الإيميل ويقبلها");
    setEmail(""); load();
  };

  const copyLink = async () => {
    const text = `انضم لمساحة "${w.name}" في نظام 👇\n${location.origin}/login\nسجّل بنفس الإيميل اللي دعوتك فيه، وبتلقى الدعوة في صفحة المساحات.`;
    await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const rename = async (patch: Partial<Workspace>) => { await supabase().from("workspaces").update(patch).eq("id", w.id); onChanged(); };

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: w.color + "22" }}>{w.icon}</span>
          <div className="flex-1 min-w-[160px]">
            {isOwner ? <input className="text-xl font-bold bg-transparent outline-none w-full" defaultValue={w.name} onBlur={(e) => e.target.value !== w.name && e.target.value && rename({ name: e.target.value })} />
              : <p className="text-xl font-bold">{w.name}</p>}
            <p className="text-xs text-muted">{w.is_personal ? "مساحتك الخاصة — ما يشوفها أحد غيرك" : `${members.length} عضو`}</p>
          </div>
          {!isCurrent && <button className="btn-primary" onClick={onSwitch}>انتقل لها</button>}
        </div>
        {isOwner && !w.is_personal && (
          <div className="flex flex-wrap gap-1 mt-4">
            {ICONS.map((i) => <button key={i} onClick={() => rename({ icon: i })} className={cn("h-8 w-8 rounded-lg", w.icon === i ? "bg-brand/15 ring-2 ring-brand" : "hover:bg-ink/5")}>{i}</button>)}
          </div>
        )}
      </section>

      {!w.is_personal && (
        <>
          <section className="card p-5">
            <h3 className="font-semibold mb-3">الأعضاء</h3>
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink/[.03]">
                  <span className="h-9 w-9 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center">{(m.profile?.full_name ?? "?")[0]}</span>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{m.profile?.full_name}{m.user_id === userId && " (أنت)"}</p><p className="text-[11px] text-muted truncate" dir="ltr">{m.profile?.email}</p></div>
                  {m.role === "owner" ? <span className="chip bg-gold/15 text-gold"><Crown size={11} /> مالك</span> : isOwner ? (
                    <>
                      <select className="input h-8 w-auto text-xs" value={m.role} onChange={async (e) => { await supabase().from("workspace_members").update({ role: e.target.value }).eq("workspace_id", w.id).eq("user_id", m.user_id); load(); }}>
                        <option value="editor">محرر</option><option value="viewer">مشاهد</option>
                      </select>
                      <button className="icon-btn hover:text-red-600" onClick={async () => { if (!confirm("إزالة العضو؟")) return; await supabase().from("workspace_members").delete().eq("workspace_id", w.id).eq("user_id", m.user_id); load(); }}><X size={14} /></button>
                    </>
                  ) : <span className="chip bg-ink/5 text-muted">{ROLES[m.role]}</span>}
                </div>
              ))}
            </div>
          </section>

          {isOwner && (
            <section className="card p-5">
              <h3 className="font-semibold mb-1">دعوة شخص</h3>
              <p className="text-xs text-muted mb-3">المحرر يضيف ويعدّل المهام والصفحات، والمشاهد يقرأ فقط. العبادات والمالية تبقى خاصة بكل شخص.</p>
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]"><Mail size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pr-9" dir="ltr" type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()} /></div>
                <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="editor">محرر</option><option value="viewer">مشاهد</option></select>
                <button className="btn-primary" onClick={invite}>دعوة</button>
              </div>
              {msg && <p className="text-sm text-brand mt-3">{msg}</p>}
              {sent.length > 0 && (
                <div className="mt-4 space-y-1">
                  <div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted">دعوات معلّقة</p>
                    <button className="text-xs text-brand flex items-center gap-1" onClick={copyLink}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "تم النسخ" : "نسخ رسالة الدعوة"}</button></div>
                  {sent.map((i) => (
                    <div key={i.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-ink/[.03]">
                      <span className="flex-1" dir="ltr">{i.email}</span><span className="chip bg-ink/5 text-muted">{ROLES[i.role]}</span>
                      <button className="icon-btn h-7 w-7" onClick={async () => { await supabase().from("workspace_invites").delete().eq("id", i.id); load(); }}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="flex gap-2">
            {isOwner ? (
              <button className="btn-outline text-red-600" onClick={async () => { if (!confirm(`حذف مساحة "${w.name}" نهائيًا مع كل مهامها وصفحاتها؟`)) return; await supabase().from("workspaces").delete().eq("id", w.id); onGone(); }}><Trash2 size={15} /> حذف المساحة</button>
            ) : (
              <button className="btn-outline text-red-600" onClick={async () => { if (!confirm("مغادرة المساحة؟")) return; await supabase().from("workspace_members").delete().eq("workspace_id", w.id).eq("user_id", userId); onGone(); }}><LogOut size={15} /> مغادرة المساحة</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CreateSpace({ open, onClose, userId, onCreated }: { open: boolean; onClose: () => void; userId: string; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏢");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    const sb = supabase();
    const { data, error } = await sb.from("workspaces").insert({ name: name.trim(), icon, color, owner_id: userId }).select("id").single();
    if (error || !data) { setErr(error?.message ?? "صار خطأ"); setBusy(false); return; }
    await sb.from("task_lists").insert([{ workspace_id: data.id, name: "عام", color, position: 0 }]);
    setBusy(false); setName(""); onCreated(data.id);
  };

  return (
    <Modal open={open} onClose={onClose} title="مساحة مشتركة جديدة">
      <div className="space-y-4">
        <input className="input" autoFocus placeholder="مثال: فريق رفد، KOVA، العائلة" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <div className="flex flex-wrap gap-1">{ICONS.map((i) => <button key={i} onClick={() => setIcon(i)} className={cn("h-9 w-9 rounded-lg text-lg", icon === i ? "bg-brand/15 ring-2 ring-brand" : "hover:bg-ink/5")}>{i}</button>)}</div>
        <div className="flex gap-2">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={cn("h-7 w-7 rounded-full", color === c && "ring-4 ring-offset-2 ring-offset-surface")} style={{ background: c, ["--tw-ring-color" as any]: c + "55" }} />)}</div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy} onClick={save}>إنشاء</button>
      </div>
    </Modal>
  );
}
