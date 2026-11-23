"use client";

import { useState } from "react";
import { Check, Flag, Repeat, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { AREAS, PRIORITY, cn, friendlyDate, nextOccurrence, today } from "@/lib/utils";
import type { Member, Task } from "@/lib/types";

/** إكمال مهمة — المتكررة تنتقل لموعدها القادم بدل ما تختفي */
export async function completeTask(t: Task): Promise<Partial<Task>> {
  const sb = supabase();
  if (t.status !== "done" && t.recurrence !== "none") {
    const patch = { due_date: nextOccurrence(t.due_date, t.recurrence), status: "todo" as const, completed_at: null };
    await sb.from("tasks").update(patch).eq("id", t.id);
    return patch;
  }
  const patch = t.status === "done"
    ? { status: "todo" as const, completed_at: null }
    : { status: "done" as const, completed_at: new Date().toISOString() };
  await sb.from("tasks").update(patch).eq("id", t.id);
  return patch;
}

export function Checkbox({ checked, color, onClick, disabled }: { checked: boolean; color?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
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
  const done = task.status === "done";
  const pr = PRIORITY[task.priority];
  const overdue = task.due_date && task.due_date < today() && !done;
  const assignee = members?.find((m) => m.user_id === task.assignee_id);

  return (
    <div onClick={() => onOpen?.(task)}
      className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-ink/[.03] cursor-pointer transition">
      <div className="pt-0.5">
        <Checkbox checked={done} color={task.priority ? pr.color : undefined} disabled={!canEdit || busy}
          onClick={async () => { setBusy(true); const p = await completeTask(task); onChange(task.id, p); setBusy(false); }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-6", done && "line-through text-muted")}>{task.title}</p>
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
