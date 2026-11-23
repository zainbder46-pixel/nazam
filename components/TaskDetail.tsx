"use client";

import { useEffect, useState } from "react";
import { Trash2, X, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { AREAS, PRIORITY, RECURRENCE, areasFor, cn } from "@/lib/utils";
import { pushUndo } from "@/lib/undo";
import type { Area, Member, Recurrence, Task, TaskList } from "@/lib/types";
import { Drawer, AutoTextarea } from "./ui";
import { Checkbox, completeTask } from "./TaskItem";

export function TaskDetail({ task, onClose, onChange, onDelete, lists, members, canEdit, allTasks, onAdd, kind }: {
  task: Task | null; onClose: () => void; onChange: (id: string, p: Partial<Task>) => void;
  onDelete: (id: string) => void; lists: TaskList[]; members: Member[]; canEdit: boolean;
  allTasks: Task[]; onAdd: (t: Task) => void; kind?: "life" | "work";
}) {
  const allowed = areasFor(kind);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [sub, setSub] = useState("");
  useEffect(() => { setTitle(task?.title ?? ""); setNotes(task?.notes ?? ""); }, [task?.id]); // eslint-disable-line

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
          <span className="text-xs text-muted">تفاصيل المهمة</span>
          <div className="flex gap-1">
            {canEdit && (
              <button className="icon-btn hover:text-red-600" onClick={async () => { await removeWithUndo(task); onClose(); }}>
                <Trash2 size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
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
