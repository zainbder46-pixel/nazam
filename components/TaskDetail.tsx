"use client";

import { useEffect, useState } from "react";
import { Trash2, X, Plus, MapPin, Bell, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { AREAS, PRIORITY, RECURRENCE, areasFor, cn } from "@/lib/utils";
import { pushUndo } from "@/lib/undo";
import type { Area, Member, Recurrence, Task, TaskList } from "@/lib/types";
import { Drawer, AutoTextarea } from "./ui";
import { Checkbox, completeTask } from "./TaskItem";
import { useApp } from "./AppProvider";
import type { Attendee } from "@/lib/types";

export const REMIND = [
  { v: null, l: "بوقتها" }, { v: 5, l: "قبل 5 دقائق" }, { v: 10, l: "قبل 10 دقائق" }, { v: 15, l: "قبل ربع ساعة" },
  { v: 30, l: "قبل نص ساعة" }, { v: 60, l: "قبل ساعة" }, { v: 120, l: "قبل ساعتين" }, { v: 1440, l: "قبل يوم" },
] as const;
const RESP = { invited: "⏳", yes: "✅", no: "❌", maybe: "🤔" } as const;

export function TaskDetail({ task, onClose, onChange, onDelete, lists, members, canEdit, allTasks, onAdd, kind }: {
  task: Task | null; onClose: () => void; onChange: (id: string, p: Partial<Task>) => void;
  onDelete: (id: string) => void; lists: TaskList[]; members: Member[]; canEdit: boolean;
  allTasks: Task[]; onAdd: (t: Task) => void; kind?: "life" | "work";
}) {
  const allowed = areasFor(kind);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [sub, setSub] = useState("");
  const [loc, setLoc] = useState("");
  const [att, setAtt] = useState<Attendee[]>([]);
  const { userId } = useApp();
  useEffect(() => { setTitle(task?.title ?? ""); setNotes(task?.notes ?? ""); setLoc(task?.location ?? ""); }, [task?.id]); // eslint-disable-line
  useEffect(() => {
    if (!task?.id) return;
    supabase().from("task_attendees").select("*").eq("task_id", task.id).then(({ data }) => setAtt(data ?? []));
  }, [task?.id]);

  if (!task) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;
  const subs = allTasks.filter((t) => t.parent_id === task.id);

  const patch = async (p: Partial<Task>) => {
    onChange(task.id, p);
    await supabase().from("tasks").update(p).eq("id", task.id);
  };

  // حذف مع إمكانية التراجع: نحتفظ بنسخة من المهمة ومهامها الفرعية ونرجعها لو طلب
  const removeWithUndo = async (t: Task) => {
    const kids = allTasks.filter((x) => x.parent_id === t.id);
    await supabase().from("tasks").delete().eq("id", t.id);
    onDelete(t.id);
    pushUndo(`حذفت «${t.title}»`, async () => {
      await supabase().from("tasks").insert([t, ...kids]);
    });
  };

  const meeting = task.kind === "meeting";
  const toggleAttendee = async (uid: string) => {
    const has = att.find((a) => a.user_id === uid);
    if (has) {
      setAtt((c) => c.filter((a) => a.user_id !== uid));
      await supabase().from("task_attendees").delete().eq("task_id", task.id).eq("user_id", uid);
    } else {
      const row: Attendee = { task_id: task.id, user_id: uid, workspace_id: task.workspace_id, response: uid === userId ? "yes" : "invited" };
      setAtt((c) => [...c, row]);
      await supabase().from("task_attendees").insert(row);
    }
  };
  const respond = async (r: Attendee["response"]) => {
    setAtt((c) => c.map((a) => (a.user_id === userId ? { ...a, response: r } : a)));
    await supabase().from("task_attendees").update({ response: r }).eq("task_id", task.id).eq("user_id", userId);
  };
  const mine = att.find((a) => a.user_id === userId);
  const memberName = (uid: string) => { const m = members.find((x) => x.user_id === uid); return m?.profile?.full_name || m?.profile?.email?.split("@")[0] || "عضو"; };

  const addSub = async () => {
    if (!sub.trim()) return;
    const { data } = await supabase().from("tasks").insert({
      workspace_id: task.workspace_id, parent_id: task.id, list_id: task.list_id, title: sub.trim(), area: task.area, position: Date.now(),
    }).select().single();
    if (data) onAdd(data);
    setSub("");
  };

  return (
    <Drawer open onClose={onClose}>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{task.kind === "meeting" ? "تفاصيل الاجتماع" : "تفاصيل المهمة"}</span>
          <div className="flex gap-1">
            {canEdit && (
              <button className="icon-btn hover:text-red-600" onClick={async () => { await removeWithUndo(task); onClose(); }}>
                <Trash2 size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-ink/5 gap-1">
          {(["task", "meeting"] as const).map((k) => (
            <button key={k} disabled={!canEdit} onClick={() => patch(k === "meeting" ? { kind: k, remind_before: task.remind_before ?? 15 } : { kind: k })}
              className={cn("px-3 h-8 rounded-lg text-sm", (task.kind ?? "task") === k ? "bg-surface shadow-soft font-medium" : "text-muted")}>
              {k === "task" ? "📌 مهمة" : "📅 اجتماع"}
            </button>
          ))}
        </div>

        <div className="flex items-start gap-3">
          <div className="pt-1.5">
            <Checkbox checked={task.status === "done"} disabled={!canEdit} onClick={async (o) => onChange(task.id, await completeTask(task, o))} />
          </div>
          <AutoTextarea value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
            className="text-xl font-semibold leading-8" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">الحالة</label>
            <select className="input" disabled={!canEdit} value={task.status} onChange={(e) => patch({ status: e.target.value as Task["status"], completed_at: e.target.value === "done" ? new Date().toISOString() : null })}>
              <option value="todo">للتنفيذ</option><option value="doing">قيد العمل</option><option value="done">منجزة</option>
            </select>
          </div>
          <div>
            <label className="label">القائمة</label>
            <select className="input" disabled={!canEdit} value={task.list_id ?? ""} onChange={(e) => patch({ list_id: e.target.value || null })}>
              <option value="">📥 صندوق الوارد</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">التاريخ</label>
            <input type="date" className="input" disabled={!canEdit} value={task.due_date ?? ""} onChange={(e) => patch({ due_date: e.target.value || null })} />
          </div>
          <div>
            <label className="label">الوقت</label>
            <input type="time" className="input" disabled={!canEdit} value={task.due_time?.slice(0, 5) ?? ""} onChange={(e) => patch({ due_time: e.target.value || null })} />
          </div>
          {meeting && (
            <div>
              <label className="label">ينتهي</label>
              <input type="time" className="input" disabled={!canEdit} value={task.end_time?.slice(0, 5) ?? ""} onChange={(e) => patch({ end_time: e.target.value || null })} />
            </div>
          )}
          <div>
            <label className="label flex items-center gap-1"><Bell size={12} /> التذكير</label>
            <select className="input" disabled={!canEdit} value={task.remind_before ?? ""} onChange={(e) => patch({ remind_before: e.target.value ? Number(e.target.value) : null })}>
              {REMIND.map((r) => <option key={r.l} value={r.v ?? ""}>{r.l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">التكرار</label>
            <select className="input" disabled={!canEdit} value={task.recurrence} onChange={(e) => patch({ recurrence: e.target.value as Recurrence })}>
              {Object.entries(RECURRENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">المسؤول</label>
            <select className="input" disabled={!canEdit} value={task.assignee_id ?? ""} onChange={(e) => patch({ assignee_id: e.target.value || null })}>
              <option value="">—</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</option>)}
            </select>
          </div>
        </div>

        {!task.due_time && <p className="text-[11px] text-muted -mt-2">⏰ حدد وقت عشان يوصلك تذكير على الجوال</p>}

        {meeting && (
          <div className="space-y-3 rounded-2xl border border-line p-3">
            <div>
              <label className="label flex items-center gap-1"><MapPin size={12} /> المكان أو الرابط</label>
              <input className="input" dir="auto" disabled={!canEdit} placeholder="مكتب رفد، أو رابط Zoom / Meet" value={loc}
                onChange={(e) => setLoc(e.target.value)} onBlur={() => loc !== (task.location ?? "") && patch({ location: loc || null })} />
              {/^https?:\/\//.test(task.location ?? "") && <a href={task.location!} target="_blank" rel="noreferrer" className="text-xs text-brand mt-1 inline-block">فتح الرابط ↗</a>}
            </div>
            <div>
              <label className="label flex items-center gap-1"><Users size={12} /> المدعوين {att.length > 0 && `(${att.length})`}</label>
              {members.length < 2 && <p className="text-xs text-muted">ادعُ أعضاء للمساحة من «المساحات» عشان تقدر تضيفهم للاجتماع</p>}
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const a = att.find((x) => x.user_id === m.user_id);
                  return (
                    <button key={m.user_id} disabled={!canEdit} onClick={() => toggleAttendee(m.user_id)}
                      className={cn("chip h-8 px-3 text-xs border", a ? "bg-brand/10 border-brand/40 text-brand font-medium" : "border-line text-muted")}>
                      {a ? RESP[a.response] : "+"} {memberName(m.user_id)}{m.user_id === userId ? " (أنا)" : ""}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted mt-1.5">كل مدعو يوصله إشعار بالدعوة، وتذكير قبل الاجتماع</p>
            </div>
            {mine && mine.user_id !== task.created_by && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">حضورك:</span>
                {(["yes", "maybe", "no"] as const).map((r) => (
                  <button key={r} onClick={() => respond(r)} className={cn("chip h-8 px-3 border text-xs", mine.response === r ? "bg-ink text-bg border-transparent" : "border-line")}>
                    {RESP[r]} {r === "yes" ? "حاضر" : r === "no" ? "معتذر" : "يمكن"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">الأولوية</label>
          <div className="flex gap-1.5">
            {PRIORITY.map((p) => (
              <button key={p.v} disabled={!canEdit} onClick={() => patch({ priority: p.v })}
                className={cn("flex-1 h-9 rounded-xl border text-xs font-medium transition", task.priority === p.v ? "text-white border-transparent" : "border-line text-muted")}
                style={task.priority === p.v ? { background: p.color } : {}}>{p.label}</button>
            ))}
          </div>
        </div>

        <div className={cn(allowed.length < 2 && "hidden")}>
          <label className="label">المجال</label>
          <div className="flex flex-wrap gap-1.5">
            {allowed.map((a) => (
              <button key={a} disabled={!canEdit} onClick={() => patch({ area: a })}
                className={cn("chip border h-7 px-2.5 text-xs", task.area === a ? "text-white border-transparent" : "border-line text-muted")}
                style={task.area === a ? { background: AREAS[a].color } : {}}>{AREAS[a].icon} {AREAS[a].label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">ملاحظات</label>
          <AutoTextarea value={notes} disabled={!canEdit} placeholder="أضف تفاصيل، روابط، أفكار..."
            onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (task.notes ?? "") && patch({ notes: notes || null })}
            className="input h-auto min-h-[90px] py-2.5 leading-6" />
        </div>

        <div>
          <label className="label">المهام الفرعية {subs.length > 0 && `(${subs.filter((s) => s.status === "done").length}/${subs.length})`}</label>
          <div className="space-y-1">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-ink/[.03]">
                <Checkbox checked={s.status === "done"} disabled={!canEdit} onClick={async (o) => onChange(s.id, await completeTask(s, o))} />
                <span className={cn("text-sm flex-1", s.status === "done" && "line-through text-muted")}>{s.title}</span>
                {canEdit && <button className="icon-btn h-6 w-6" onClick={() => removeWithUndo(s)}><X size={12} /></button>}
              </div>
            ))}
            {canEdit && (
              <div className="flex items-center gap-2 px-2">
                <Plus size={16} className="text-muted" />
                <input value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()}
                  placeholder="أضف مهمة فرعية" className="flex-1 bg-transparent text-sm outline-none h-8" />
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
