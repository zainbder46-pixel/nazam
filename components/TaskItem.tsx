"use client";

import { useState } from "react";
import { Check, Flag, Repeat, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { AREAS, PRIORITY, cn, friendlyDate, nextOccurrence, today } from "@/lib/utils";
import { pushUndo } from "@/lib/undo";
import type { Member, Task } from "@/lib/types";

/** إكمال مهمة — المتكررة تنتقل لموعدها القادم، وكل إنجاز ينسجل ويقبل التراجع */
export async function completeTask(t: Task, origin?: { x: number; y: number }): Promise<Partial<Task>> {
  const sb = supabase();
  const prev = { status: t.status, due_date: t.due_date, completed_at: t.completed_at };

  // شيل التشييك عن مهمة منجزة
  if (t.status === "done") {
    const patch = { status: "todo" as const, completed_at: null };
    await sb.from("tasks").update(patch).eq("id", t.id);
    pushUndo(`رجّعت «${t.title}» غير منجزة`, async () => { await sb.from("tasks").update(prev).eq("id", t.id); });
    return patch;
  }

  const recurring = t.recurrence !== "none";
  const patch: Partial<Task> = recurring
    ? { due_date: nextOccurrence(t.due_date, t.recurrence), status: "todo", completed_at: null }
    : { status: "done", completed_at: new Date().toISOString() };
  const [, ins] = await Promise.all([
    sb.from("tasks").update(patch).eq("id", t.id),
    sb.from("task_completions").insert({ task_id: t.id, workspace_id: t.workspace_id, title: t.title }).select("id").single(),
  ]);
  const compId = ins.data?.id as string | undefined;
  pushUndo(`أنجزت «${t.title}»`, async () => {
    await sb.from("tasks").update(prev).eq("id", t.id);
    if (compId) await sb.from("task_completions").delete().eq("id", compId);
  }, { title: t.title, recurring, next: recurring ? patch.due_date ?? null : null, x: origin?.x, y: origin?.y });
  return patch;
}

export function Checkbox({ checked, color, onClick, disabled }: { checked: boolean; color?: string; onClick: (origin: { x: number; y: number }) => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onClick({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
      className={cn("shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition", checked && "anim-check")}
      style={{ borderColor: color ?? "rgb(var(--muted))", background: checked ? color ?? "rgb(var(--brand))" : "transparent" }}>
      {checked && <Check size={12} strokeWidth={3} className="text-white" />}
    </button>
  );
}

export function TaskItem({ task, members, onChange, onOpen, canEdit, showArea = true, subCount }: {
  task: Task; members?: Member[]; onChange: (id: string, patch: Partial<Task>) => void;
  onOpen?: (t: Task) => void; canEdit: boolean; showArea?: boolean; subCount?: { done: number; total: number };
}) {
  const [busy, setBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const done = task.status === "done" || celebrating;
  const pr = PRIORITY[task.priority];
  const overdue = task.due_date && task.due_date < today() && !done;
  const assignee = members?.find((m) => m.user_id === task.assignee_id);

  return (
    <div onClick={() => onOpen?.(task)}
      className={cn("group flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-500", celebrating ? "bg-brand/10 scale-[.99]" : "hover:bg-ink/[.03]")}>
      <div className="pt-0.5">
        <Checkbox checked={done} color={task.priority ? pr.color : undefined} disabled={!canEdit || busy}
          onClick={async (origin) => {
            setBusy(true);
            if (task.status !== "done") {
              // نخلي المهمة تتلوّن وتنشطب لحظة قبل ما تختفي أو تنتقل لموعدها الجاي
              setCelebrating(true);
              const [p] = await Promise.all([completeTask(task, origin), new Promise((r) => setTimeout(r, 900))]);
              setCelebrating(false);
              onChange(task.id, p);
            } else {
              onChange(task.id, await completeTask(task, origin));
            }
            setBusy(false);
          }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-6 transition-colors", done && "line-through text-muted", celebrating && "text-brand")}>{task.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 empty:hidden">
          {task.due_date && (
            <span className={cn("chip", overdue ? "bg-red-500/10 text-red-600" : task.due_date === today() ? "bg-brand/10 text-brand" : "bg-ink/5 text-muted")}>
              <CalendarDays size={11} /> {friendlyDate(task.due_date)}{task.due_time ? ` ${task.due_time.slice(0, 5)}` : ""}
            </span>
          )}
          {task.recurrence !== "none" && <span className="chip bg-ink/5 text-muted"><Repeat size={11} /></span>}
          {showArea && <span className="chip" style={{ background: AREAS[task.area].color + "18", color: AREAS[task.area].color }}>{AREAS[task.area].icon} {AREAS[task.area].label}</span>}
          {subCount && subCount.total > 0 && <span className="chip bg-ink/5 text-muted">{subCount.done}/{subCount.total}</span>}
          {task.notes && <span className="text-[11px] text-muted truncate max-w-[200px]">{task.notes}</span>}
        </div>
      </div>
      {task.priority > 0 && <Flag size={14} style={{ color: pr.color }} fill={pr.color} className="mt-1 shrink-0" />}
      {assignee && (
        <span title={assignee.profile?.full_name ?? ""} className="shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-[11px] font-bold flex items-center justify-center">
          {(assignee.profile?.full_name ?? "?")[0]}
        </span>
      )}
    </div>
  );
}
