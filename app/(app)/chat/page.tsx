"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, CalendarDays, CheckCircle2, Circle, ListTodo, Send, Trash2, X } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Empty, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { cn, friendlyDate } from "@/lib/utils";
import type { Member, Message, Task } from "@/lib/types";

const nameOf = (m?: Member) => m?.profile?.full_name || m?.profile?.email?.split("@")[0] || "عضو";
const time = (iso: string) => new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/** محادثة الفريق داخل المساحة — لحظية، مع منشن وإرسال مهام */
export default function ChatPage() {
  const { ws, workspaces, setWsId, members, userId } = useApp();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task>>({});
  const [text, setText] = useState("");
  const [muted, setMuted] = useState(false);
  const [picker, setPicker] = useState(false);
  const [mention, setMention] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // لو جاي من إشعار لمساحة ثانية
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("ws");
    if (id && id !== ws?.id && workspaces.some((w) => w.id === id)) setWsId(id);
  }, [workspaces]); // eslint-disable-line react-hooks/exhaustive-deps

  const wsId = ws && !ws.is_personal ? ws.id : null;
  const byId = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const markRead = () => { if (wsId) supabase().from("chat_prefs").upsert({ workspace_id: wsId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id" }); };

  const loadTasks = async (ids: string[]) => {
    const need = ids.filter((id) => id && !tasks[id]);
    if (!need.length) return;
    const { data } = await supabase().from("tasks").select("*").in("id", need);
    if (data) setTasks((cur) => ({ ...cur, ...Object.fromEntries(data.map((t: Task) => [t.id, t])) }));
  };

  useEffect(() => {
    if (!wsId) return;
    const sb = supabase();
    setLoading(true);
    sb.from("messages").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(150).then(({ data }) => {
      const list = ((data ?? []) as Message[]).reverse();
      setMsgs(list); setLoading(false);
      loadTasks(list.map((m) => m.task_id!).filter(Boolean));
      setTimeout(() => endRef.current?.scrollIntoView(), 30);
    });
    sb.from("chat_prefs").select("muted").eq("workspace_id", wsId).eq("user_id", userId).maybeSingle().then(({ data }) => setMuted(!!data?.muted));
    markRead();
    const ch = sb.channel(`chat-${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `workspace_id=eq.${wsId}` }, (p: any) => {
        if (p.eventType === "DELETE") return setMsgs((c) => c.filter((m) => m.id !== p.old.id));
        const row = p.new as Message;
        setMsgs((c) => (c.some((m) => m.id === row.id) ? c.map((m) => (m.id === row.id ? row : m)) : [...c, row]));
        if (row.task_id) loadTasks([row.task_id]);
        if (p.eventType === "INSERT") { markRead(); setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30); }
      }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (taskId?: string) => {
    const body = text.trim();
    if (!wsId || (!body && !taskId)) return;
    const mentions = members.filter((m) => m.user_id !== userId && body.includes("@" + nameOf(m))).map((m) => m.user_id);
    const temp: Message = { id: crypto.randomUUID(), workspace_id: wsId, user_id: userId, body: taskId ? "" : body, task_id: taskId ?? null, reply_to: null, mentions, edited_at: null, created_at: new Date().toISOString() };
    setMsgs((c) => [...c, temp]);
    if (!taskId) setText("");
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    await supabase().from("messages").insert({ id: temp.id, workspace_id: wsId, body: temp.body, task_id: temp.task_id, mentions });
  };

  const remove = async (m: Message) => {
    if (!confirm("حذف الرسالة؟")) return;
    setMsgs((c) => c.filter((x) => x.id !== m.id));
    await supabase().from("messages").delete().eq("id", m.id);
  };

  const toggleMute = async () => {
    const next = !muted; setMuted(next);
    await supabase().from("chat_prefs").upsert({ workspace_id: wsId, user_id: userId, muted: next }, { onConflict: "workspace_id,user_id" });
  };

  const onType = (v: string) => {
    setText(v);
    const m = v.match(/@([^\s@]*)$/);
    setMention(m ? m[1] : null);
  };
  const pickMention = (m: Member) => {
    setText((t) => t.replace(/@([^\s@]*)$/, "@" + nameOf(m) + " "));
    setMention(null); inputRef.current?.focus();
  };
  const mentionList = mention === null ? [] : members.filter((m) => m.user_id !== userId && nameOf(m).includes(mention));

  const shared = workspaces.filter((w) => !w.is_personal);
  if (!wsId) {
    return (
      <div className="max-w-md mx-auto">
        <Empty icon="💬" title="المحادثة للمساحات المشتركة" hint={shared.length ? "اختر مساحة تتكلم فيها مع فريقك" : "سوّ مساحة وادعُ فريقك من «المساحات»"} />
        <div className="space-y-2">
          {shared.map((w) => (
            <button key={w.id} onClick={() => setWsId(w.id)} className="card w-full flex items-center gap-3 p-3 text-start hover:border-brand/40">
              <span className="text-xl">{w.icon}</span><span className="font-medium flex-1">{w.name}</span>
            </button>
          ))}
          {!shared.length && <Link href="/spaces" className="btn-primary w-full">المساحات</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col fixed inset-x-0 top-14 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 bg-bg px-4 pt-3 lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:h-[calc(100dvh-5rem)]">
      <div className="flex items-center gap-3 pb-3 border-b border-line">
        <span className="h-10 w-10 rounded-xl flex items-center justify-center text-xl" style={{ background: ws!.color + "22" }}>{ws!.icon}</span>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate">{ws!.name}</h1>
          <p className="text-xs text-muted truncate">{members.map(nameOf).join("، ")}</p>
        </div>
        <button onClick={toggleMute} className={cn("icon-btn", muted && "text-muted")} title={muted ? "مكتومة — بيوصلك بس لو أحد ذكرك" : "كتم الإشعارات"}>
          {muted ? <BellOff size={18} /> : <Bell size={18} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-1">
        {loading && <p className="text-center text-sm text-muted py-10">يحمّل...</p>}
        {!loading && !msgs.length && <Empty icon="👋" title="ابدأ المحادثة" hint="اكتب لفريقك، اذكر أحد بـ @، أو أرسل مهمة" />}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const mine = m.user_id === userId;
          const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const grouped = !newDay && prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
          const t = m.task_id ? tasks[m.task_id] : null;
          const who = byId.get(m.user_id);
          return (
            <div key={m.id}>
              {newDay && <p className="text-center text-[11px] text-muted my-3"><span className="chip bg-ink/5">{friendlyDate(dayKey(m.created_at))}</span></p>}
              <div className={cn("group flex items-end gap-2", mine ? "flex-row" : "flex-row-reverse", grouped ? "mt-0.5" : "mt-3")}>
                <div className={cn("max-w-[80%] sm:max-w-[65%]", mine ? "items-start" : "items-end", "flex flex-col")}>
                  {!mine && !grouped && <span className="text-[11px] text-muted px-2 mb-0.5">{nameOf(who)}</span>}
                  {t ? (
                    <Link href={`/tasks?open=${t.id}`} className={cn("rounded-2xl border p-3 min-w-[220px] block", mine ? "bg-brand/10 border-brand/30" : "bg-surface border-line")}>
                      <span className="text-[11px] text-muted flex items-center gap-1"><ListTodo size={12} /> {t.kind === "meeting" ? "اجتماع" : "مهمة"}</span>
                      <span className="flex items-center gap-2 mt-1">
                        {t.status === "done" ? <CheckCircle2 size={16} className="text-brand shrink-0" /> : <Circle size={16} className="text-muted shrink-0" />}
                        <span className={cn("text-sm font-medium", t.status === "done" && "line-through text-muted")}>{t.title}</span>
                      </span>
                      {(t.due_date || t.assignee_id) && (
                        <span className="text-[11px] text-muted flex items-center gap-2 mt-1.5">
                          {t.due_date && <span className="flex items-center gap-1"><CalendarDays size={11} /> {friendlyDate(t.due_date)}{t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}</span>}
                          {t.assignee_id && <span>👤 {nameOf(byId.get(t.assignee_id))}</span>}
                        </span>
                      )}
                    </Link>
                  ) : m.task_id ? (
                    <span className="rounded-2xl border border-line px-3 py-2 text-sm text-muted">📌 مهمة</span>
                  ) : (
                    <p className={cn("rounded-2xl px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap break-words",
                      mine ? "bg-brand text-white rounded-br-md" : "bg-surface border border-line rounded-bl-md",
                      m.mentions?.includes(userId) && !mine && "ring-2 ring-gold/50")}>
                      {m.body.split(/(@[^\s@]+(?:\s[^\s@]+)?)/g).map((part, j) => {
                        const isM = part.startsWith("@") && members.some((mm) => part.startsWith("@" + nameOf(mm)));
                        return isM ? <b key={j} className={mine ? "text-white underline" : "text-brand"}>{part}</b> : <span key={j}>{part}</span>;
                      })}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted mb-1 shrink-0">{time(m.created_at)}</span>
                {mine && <button onClick={() => remove(m)} className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100 mb-0.5"><Trash2 size={12} /></button>}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="relative border-t border-line pt-3 pb-2">
        {mentionList.length > 0 && (
          <div className="absolute bottom-full mb-2 right-0 card p-1 min-w-[180px] anim-pop">
            {mentionList.map((m) => (
              <button key={m.user_id} onClick={() => pickMention(m)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm hover:bg-ink/5">
                <span className="h-6 w-6 rounded-full bg-gold/20 text-gold text-[11px] font-bold flex items-center justify-center">{nameOf(m)[0]}</span> {nameOf(m)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button onClick={() => setPicker(true)} className="icon-btn h-11 w-11 shrink-0" title="أرسل مهمة"><ListTodo size={19} /></button>
          <textarea ref={inputRef} rows={1} value={text} onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); send(); } }}
            placeholder="اكتب رسالة... (@ لذكر أحد)" className="input flex-1 min-h-[44px] max-h-32 py-2.5 resize-none leading-6" />
          <button onClick={() => send()} disabled={!text.trim()} className="btn-primary h-11 w-11 p-0 shrink-0 rounded-full"><Send size={18} className="-scale-x-100" /></button>
        </div>
      </div>

      <TaskPicker open={picker} onClose={() => setPicker(false)} wsId={wsId} onPick={(t) => { setPicker(false); setTasks((c) => ({ ...c, [t.id]: t })); send(t.id); }} />
    </div>
  );
}

function TaskPicker({ open, onClose, wsId, onPick }: { open: boolean; onClose: () => void; wsId: string; onPick: (t: Task) => void }) {
  const [list, setList] = useState<Task[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    supabase().from("tasks").select("*").eq("workspace_id", wsId).is("parent_id", null).neq("status", "done").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setList(data ?? []));
  }, [open, wsId]);
  const shown = list.filter((t) => t.title.includes(q));
  return (
    <Modal open={open} onClose={onClose} title="أرسل مهمة للمحادثة">
      <input className="input mb-3" placeholder="ابحث..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="max-h-[50vh] overflow-y-auto space-y-1">
        {!shown.length && <p className="text-sm text-muted text-center py-6">ما فيه مهام مفتوحة</p>}
        {shown.map((t) => (
          <button key={t.id} onClick={() => onPick(t)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-ink/5 text-start text-sm">
            <span>{t.kind === "meeting" ? "📅" : "📌"}</span><span className="flex-1 truncate">{t.title}</span>
            {t.due_date && <span className="text-[11px] text-muted">{friendlyDate(t.due_date)}</span>}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="btn-ghost w-full mt-2"><X size={14} /> إلغاء</button>
    </Modal>
  );
}
