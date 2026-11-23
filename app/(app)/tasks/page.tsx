"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, Sun, CalendarRange, ListChecks, CheckCircle2, Plus, LayoutList, Columns3, Trash2, Pencil, Users } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { useTasks } from "@/lib/useTasks";
import { TaskItem } from "@/components/TaskItem";
import { TaskDetail } from "@/components/TaskDetail";
import { Empty, Modal, PageHeader, Segmented, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { AREAS, addDays, areasFor, cn, friendlyDate, today } from "@/lib/utils";
import { pushUndo } from "@/lib/undo";
import type { Area, Task, TaskList } from "@/lib/types";

type View = "inbox" | "today" | "upcoming" | "meetings" | "all" | "done" | `list:${string}`;
const COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#b45309", "#475569"];

export default function TasksPage() {
  const { ws, lists, members, canEdit, tasksVersion, reloadLists, setQuickAddOpen, setWsId, workspaces } = useApp();
  const { tasks, loading, update, remove, add } = useTasks(ws?.id, tasksVersion);
  const [view, setView] = useState<View>("today");
  const [mode, setMode] = useState<"list" | "board">("list");
  const [area, setArea] = useState<Area | "all">("all");
  const [open, setOpen] = useState<Task | null>(null);
  const [inline, setInline] = useState("");
  const [listModal, setListModal] = useState<TaskList | "new" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // فتح مهمة من إشعار: /tasks?open=ID (ولو كانت في مساحة ثانية ننتقل لها)
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { setOpenId(new URLSearchParams(location.search).get("open")); }, []);
  useEffect(() => {
    if (!openId || loading) return;
    const t = tasks.find((x) => x.id === openId);
    if (t) { setOpen(t); setOpenId(null); history.replaceState(null, "", "/tasks"); return; }
    supabase().from("tasks").select("workspace_id").eq("id", openId).maybeSingle().then(({ data }) => {
      if (data && data.workspace_id !== ws?.id && workspaces.some((w) => w.id === data.workspace_id)) setWsId(data.workspace_id);
      else setOpenId(null);
    });
  }, [openId, loading, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const t0 = today();
  const allowed = areasFor(ws?.kind);
  const roots = tasks.filter((t) => !t.parent_id);
  const filtered = useMemo(() => {
    let r = roots;
    if (area !== "all") r = r.filter((t) => t.area === area);
    if (mode === "board") return view.startsWith("list:") ? r.filter((t) => t.list_id === view.slice(5)) : r.filter((t) => t.status !== "done" || (t.completed_at ?? "") > addDays(t0, -7));
    switch (view) {
      case "inbox": return r.filter((t) => !t.list_id && t.status !== "done");
      case "today": return r.filter((t) => t.status !== "done" && t.due_date && t.due_date <= t0);
      case "upcoming": return r.filter((t) => t.status !== "done" && t.due_date && t.due_date > t0).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
      case "meetings": return r.filter((t) => t.kind === "meeting" && t.status !== "done").sort((a, b) => `${a.due_date ?? "9"} ${a.due_time ?? ""}`.localeCompare(`${b.due_date ?? "9"} ${b.due_time ?? ""}`));
      case "all": return r.filter((t) => t.status !== "done");
      case "done": return r.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
      default: return r.filter((t) => t.list_id === view.slice(5));
    }
  }, [roots, view, area, mode, t0]);

  const counts = {
    inbox: roots.filter((t) => !t.list_id && t.status !== "done").length,
    today: roots.filter((t) => t.status !== "done" && t.due_date && t.due_date <= t0).length,
    upcoming: roots.filter((t) => t.status !== "done" && t.due_date && t.due_date > t0).length,
    all: roots.filter((t) => t.status !== "done").length,
    meetings: roots.filter((t) => t.kind === "meeting" && t.status !== "done").length,
  };

  const newMeeting = async () => {
    if (!ws) return;
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    const { data } = await supabase().from("tasks").insert({
      workspace_id: ws.id, title: "اجتماع جديد", kind: "meeting", due_date: today(), due_time: `${String(d.getHours()).padStart(2, "0")}:00`,
      remind_before: 15, area: allowed.includes("work") ? "work" : allowed[0], position: Date.now(),
    }).select().single();
    if (data) { add(data); setOpen(data); setView("meetings"); }
  };
  const subCount = (id: string) => { const s = tasks.filter((t) => t.parent_id === id); return { done: s.filter((x) => x.status === "done").length, total: s.length }; };

  const addInline = async () => {
    if (!ws || !inline.trim()) return;
    const listId = view.startsWith("list:") ? view.slice(5) : null;
    const due = view === "today" ? t0 : view === "upcoming" ? addDays(t0, 1) : null;
    const { data } = await supabase().from("tasks").insert({
      workspace_id: ws.id, title: inline.trim(), list_id: listId, due_date: due, area: area === "all" ? allowed[0] : area, position: Date.now(),
    }).select().single();
    if (data) add(data);
    setInline("");
  };

  const deleteList = async (l: TaskList) => {
    const n = roots.filter((t) => t.list_id === l.id).length;
    if (!confirm(`حذف قائمة «${l.name}»؟${n ? `\n${n} مهمة فيها بتنتقل لصندوق الوارد.` : ""}`)) return;
    const ids = tasks.filter((t) => t.list_id === l.id).map((t) => t.id);
    await supabase().from("task_lists").delete().eq("id", l.id);
    if (view === `list:${l.id}`) setView("inbox");
    await reloadLists();
    ids.forEach((id) => update(id, { list_id: null }));
    pushUndo(`حذفت قائمة «${l.name}»`, async () => {
      const sb = supabase();
      await sb.from("task_lists").insert({ id: l.id, workspace_id: l.workspace_id, name: l.name, color: l.color, position: l.position });
      if (ids.length) await sb.from("tasks").update({ list_id: l.id }).in("id", ids);
    });
  };

  const moveStatus = async (id: string, status: Task["status"]) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    const prev = { status: t.status, completed_at: t.completed_at };
    const p = { status, completed_at: status === "done" ? new Date().toISOString() : null };
    update(id, p);
    await supabase().from("tasks").update(p).eq("id", id);
    const label = status === "done" ? "منجزة" : status === "doing" ? "قيد العمل" : "للتنفيذ";
    pushUndo(`نقلت «${t.title}» إلى ${label}`, async () => { await supabase().from("tasks").update(prev).eq("id", id); },
      status === "done" ? { title: t.title, recurring: false, next: null } : undefined);
  };

  const currentTitle = view === "inbox" ? "صندوق الوارد" : view === "today" ? "اليوم" : view === "upcoming" ? "القادمة" : view === "meetings" ? "الاجتماعات" : view === "all" ? "كل المهام" : view === "done" ? "المنجزة" : lists.find((l) => `list:${l.id}` === view)?.name ?? "";

  // تجميع القائمة
  const groups: { key: string; label: string; items: Task[] }[] = useMemo(() => {
    if (view === "upcoming" || view === "meetings") {
      const m = new Map<string, Task[]>();
      filtered.forEach((t) => { const k = t.due_date ?? ""; m.set(k, [...(m.get(k) ?? []), t]); });
      return [...m.entries()].map(([k, v]) => ({ key: k || "none", label: k ? friendlyDate(k) : "بدون موعد", items: v }));
    }
    if (view === "today") {
      const over = filtered.filter((t) => t.due_date! < t0);
      const tod = filtered.filter((t) => t.due_date === t0).sort((a, b) => b.priority - a.priority || (a.due_time ?? "99").localeCompare(b.due_time ?? "99"));
      return [{ key: "o", label: "متأخرة", items: over }, { key: "t", label: "اليوم", items: tod }].filter((g) => g.items.length);
    }
    if (view.startsWith("list:")) {
      return [
        { key: "a", label: "", items: filtered.filter((t) => t.status !== "done").sort((a, b) => b.priority - a.priority) },
        { key: "d", label: "منجزة", items: filtered.filter((t) => t.status === "done") },
      ].filter((g) => g.items.length);
    }
    return [{ key: "x", label: "", items: filtered }];
  }, [filtered, view, t0]);

  return (
    <div>
      <PageHeader title="المهام" subtitle={!ws ? "" : ws.is_personal ? "مهامك الشخصية — خاصة فيك" : `${ws.kind === "work" ? "💼" : "🌿"} ${ws.name}`}
        actions={<>
          <Segmented value={mode} onChange={setMode} options={[{ value: "list", label: <LayoutList size={16} /> }, { value: "board", label: <Columns3 size={16} /> }]} />
          {canEdit && <button className="btn-outline" onClick={newMeeting}>📅 اجتماع</button>}
          {canEdit && <button className="btn-primary" onClick={() => setQuickAddOpen(true)}><Plus size={16} /> مهمة</button>}
        </>} />

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        {/* القوائم */}
        <div className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0 pb-2 lg:pb-0">
          {([
            ["inbox", "صندوق الوارد", Inbox, counts.inbox],
            ["today", "اليوم", Sun, counts.today],
            ["upcoming", "القادمة", CalendarRange, counts.upcoming],
            ["meetings", "الاجتماعات", Users, counts.meetings],
            ["all", "الكل", ListChecks, counts.all],
            ["done", "المنجزة", CheckCircle2, 0],
          ] as const).map(([v, l, Icon, c]) => (
            <button key={v} onClick={() => setView(v)} className={cn("shrink-0 flex items-center gap-2.5 rounded-xl px-3 h-9 text-sm transition", view === v ? "bg-surface shadow-soft border border-line font-semibold" : "text-ink/70 hover:bg-ink/5")}>
              <Icon size={16} className={view === v ? "text-brand" : ""} /> {l}
              {c > 0 && <span className="mr-auto text-xs text-muted">{c}</span>}
            </button>
          ))}
          <div className="hidden lg:flex items-center justify-between px-3 mt-4 mb-1">
            <span className="text-[11px] font-semibold text-muted">القوائم</span>
            {canEdit && <button className="icon-btn h-6 w-6" onClick={() => setListModal("new")}><Plus size={14} /></button>}
          </div>
          {lists.map((l) => (
            <div key={l.id} className={cn("group shrink-0 flex items-center rounded-xl transition", view === `list:${l.id}` ? "bg-surface shadow-soft border border-line" : "hover:bg-ink/5")}>
              <button onClick={() => setView(`list:${l.id}`)} className={cn("flex-1 min-w-0 flex items-center gap-2.5 px-3 h-9 text-sm", view === `list:${l.id}` ? "font-semibold" : "text-ink/70")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} /> <span className="truncate">{l.name}</span>
                <span className="mr-auto text-xs text-muted lg:group-hover:hidden">{roots.filter((t) => t.list_id === l.id && t.status !== "done").length || ""}</span>
              </button>
              {canEdit && (
                <span className={cn("flex items-center pl-1", view === `list:${l.id}` ? "flex" : "hidden lg:group-hover:flex")}>
                  <button title="تعديل" onClick={() => setListModal(l)} className="icon-btn h-7 w-7"><Pencil size={13} /></button>
                  <button title="حذف" onClick={() => deleteList(l)} className="icon-btn h-7 w-7 hover:text-red-600"><Trash2 size={13} /></button>
                </span>
              )}
            </div>
          ))}
          {canEdit && <button className="lg:hidden shrink-0 btn-ghost h-9" onClick={() => setListModal("new")}><Plus size={14} /> قائمة</button>}
        </div>

        <div className="min-w-0">
          {/* فلتر المجال */}
          <div className={cn("flex flex-wrap gap-1.5 mb-4", allowed.length < 2 && "hidden")}>
            <button onClick={() => setArea("all")} className={cn("chip h-7 px-3 text-xs border", area === "all" ? "bg-ink text-bg border-transparent" : "border-line text-muted")}>الكل</button>
            {allowed.map((a) => (
              <button key={a} onClick={() => setArea(a)} className={cn("chip h-7 px-3 text-xs border", area === a ? "text-white border-transparent" : "border-line text-muted")}
                style={area === a ? { background: AREAS[a].color } : {}}>{AREAS[a].icon} {AREAS[a].label}</button>
            ))}
          </div>

          {loading ? <Spinner /> : mode === "list" ? (
            <div className="card p-2">
              <h2 className="px-3 pt-2 pb-1 font-semibold">{currentTitle}</h2>
              {canEdit && view !== "done" && (
                <div className="flex items-center gap-3 px-3 py-2 border-b border-line mb-1">
                  <Plus size={18} className="text-brand" />
                  <input value={inline} onChange={(e) => setInline(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInline()}
                    placeholder="أضف مهمة واضغط Enter" className="flex-1 bg-transparent outline-none text-sm h-8" />
                </div>
              )}
              {groups.length === 0 || filtered.length === 0 ? (
                <Empty icon={view === "today" ? "🌤️" : "✨"} title={view === "today" ? "يومك فاضي" : "ما فيه مهام هنا"} hint={view === "today" ? "استمتع، أو أضف شي تنجزه" : undefined} />
              ) : groups.map((g) => (
                <div key={g.key} className="mb-2">
                  {g.label && <p className={cn("px-3 pt-3 pb-1 text-xs font-semibold", g.label === "متأخرة" ? "text-red-600" : "text-muted")}>{g.label} · {g.items.length}</p>}
                  {g.items.map((t) => (
                    <TaskItem key={t.id} task={t} members={members} canEdit={canEdit} onChange={update} onOpen={setOpen} subCount={subCount(t.id)} showArea={area === "all" && allowed.length > 1} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              {([["todo", "للتنفيذ", "#64748b"], ["doing", "قيد العمل", "#f59e0b"], ["done", "منجزة", "#16a34a"]] as const).map(([s, l, c]) => {
                const col = filtered.filter((t) => t.status === s);
                return (
                  <div key={s} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId && canEdit) moveStatus(dragId, s); setDragId(null); }}
                    className="rounded-2xl bg-ink/[.03] border border-line p-2 min-h-[300px]">
                    <div className="flex items-center gap-2 px-2 py-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                      <span className="text-sm font-semibold">{l}</span>
                      <span className="text-xs text-muted">{col.length}</span>
                    </div>
                    <div className="space-y-2">
                      {col.map((t) => (
                        <div key={t.id} draggable={canEdit} onDragStart={() => setDragId(t.id)}
                          className={cn("card p-0 cursor-grab active:cursor-grabbing", dragId === t.id && "opacity-50")}>
                          <TaskItem task={t} members={members} canEdit={canEdit} onChange={update} onOpen={setOpen} subCount={subCount(t.id)} showArea={allowed.length > 1} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TaskDetail task={open ? tasks.find((t) => t.id === open.id) ?? null : null} onClose={() => setOpen(null)}
        onChange={update} onDelete={remove} lists={lists} members={members} canEdit={canEdit} allTasks={tasks} onAdd={add} kind={ws?.kind} />

      <ListModal value={listModal} onClose={() => setListModal(null)} wsId={ws?.id} onSaved={async () => { await reloadLists(); setListModal(null); }}
        onDeleted={async () => { await reloadLists(); setListModal(null); setView("all"); }} count={lists.length} />
    </div>
  );
}

function ListModal({ value, onClose, wsId, onSaved, onDeleted, count }: {
  value: TaskList | "new" | null; onClose: () => void; wsId?: string; onSaved: () => void; onDeleted: () => void; count: number;
}) {
  const edit = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = value === "new" ? "new" : edit?.id ?? null;
  if (key !== lastKey) { setLastKey(key); setName(edit?.name ?? ""); setColor(edit?.color ?? COLORS[0]); }

  const save = async () => {
    if (!name.trim() || !wsId) return;
    const sb = supabase();
    if (edit) await sb.from("task_lists").update({ name: name.trim(), color }).eq("id", edit.id);
    else await sb.from("task_lists").insert({ workspace_id: wsId, name: name.trim(), color, position: count });
    onSaved();
  };
  return (
    <Modal open={!!value} onClose={onClose} title={edit ? "تعديل القائمة" : "قائمة جديدة"}>
      <div className="space-y-4">
        <input className="input" autoFocus placeholder="اسم القائمة، مثال: مشروع KOVA" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <div className="flex gap-2">
          {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={cn("h-8 w-8 rounded-full transition", color === c && "ring-4 ring-offset-2 ring-offset-surface")} style={{ background: c, ["--tw-ring-color" as any]: c + "55" }} />)}
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={save}>حفظ</button>
          {edit && <button className="btn-outline text-red-600" onClick={async () => { await supabase().from("task_lists").delete().eq("id", edit.id); onDeleted(); }}><Trash2 size={16} /> حذف</button>}
        </div>
      </div>
    </Modal>
  );
}
