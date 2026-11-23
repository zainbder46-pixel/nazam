"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Flag, Repeat } from "lucide-react";
import { useApp } from "./AppProvider";
import { Modal } from "./ui";
import { supabase } from "@/lib/supabase/client";
import { AREAS, PRIORITY, RECURRENCE, addDays, areasFor, cn, friendlyDate, parseQuick, today } from "@/lib/utils";
import type { Area, Recurrence } from "@/lib/types";

export function QuickAdd() {
  const { quickAddOpen, setQuickAddOpen, ws, lists, userId, bumpTasks } = useApp();
  const [text, setText] = useState("");
  const [listId, setListId] = useState<string>("");
  const [area, setArea] = useState<Area>("life");
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState(0);
  const [rec, setRec] = useState<Recurrence>("none");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const allowed = areasFor(ws?.kind);
  useEffect(() => {
    if (quickAddOpen) { setText(""); setDue(null); setPriority(0); setRec("none"); setArea(allowed[0]); setTimeout(() => ref.current?.focus(), 30); }
  }, [quickAddOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = parseQuick(text);
  const finalDue = due ?? parsed.due;
  const finalPriority = priority || parsed.priority;
  const finalArea = parsed.area && allowed.includes(parsed.area) ? parsed.area : allowed.includes(area) ? area : allowed[0];

  async function save(keepOpen = false) {
    if (!ws || !parsed.title) return;
    setSaving(true);
    await supabase().from("tasks").insert({
      workspace_id: ws.id, list_id: listId || null, title: parsed.title, due_date: finalDue,
      priority: finalPriority, area: finalArea, recurrence: rec, created_by: userId, position: Date.now(),
    });
    setSaving(false);
    bumpTasks();
    if (keepOpen) { setText(""); ref.current?.focus(); } else setQuickAddOpen(false);
  }

  return (
    <Modal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} wide>
      <div className="pt-3">
        <input ref={ref} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(e.shiftKey); } }}
          placeholder="وش في بالك؟"
          className="w-full text-lg bg-transparent outline-none placeholder:text-muted py-2" />
        <p className="hidden sm:block text-[11px] text-muted mb-4">اكتب «اليوم/بكرة» للتاريخ، ‎!1-3‎ للأولوية{allowed.length > 1 ? "، ‎#دين #مالية #صحة‎ للمجال" : ""} · Enter للحفظ · Shift+Enter حفظ وإضافة أخرى</p>

        <div className={cn("flex flex-wrap gap-1.5 mb-3", allowed.length < 2 && "hidden")}>
          {allowed.map((a) => (
            <button key={a} onClick={() => setArea(a)}
              className={cn("chip border h-7 px-2.5 text-xs", finalArea === a ? "border-transparent text-white" : "border-line text-muted")}
              style={finalArea === a ? { background: AREAS[a].color } : {}}>
              {AREAS[a].icon} {AREAS[a].label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line px-2 h-9">
            <CalendarDays size={15} className="text-muted" />
            {[{ l: "اليوم", v: today() }, { l: "بكرة", v: addDays(today(), 1) }].map((o) => (
              <button key={o.l} onClick={() => setDue(finalDue === o.v ? null : o.v)} className={cn("text-xs px-2 h-6 rounded-md", finalDue === o.v ? "bg-brand text-white" : "hover:bg-ink/5")}>{o.l}</button>
            ))}
            <input type="date" value={finalDue ?? ""} onChange={(e) => setDue(e.target.value || null)} className="text-xs bg-transparent outline-none w-[120px]" />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-line px-2 h-9">
            <Flag size={15} className="text-muted" />
            {PRIORITY.slice(1).map((p) => (
              <button key={p.v} onClick={() => setPriority(finalPriority === p.v ? 0 : p.v)} title={p.label}
                className={cn("h-6 w-6 rounded-md flex items-center justify-center", finalPriority === p.v && "ring-2")} style={{ color: p.color, ["--tw-ring-color" as any]: p.color }}>
                <Flag size={13} fill={finalPriority === p.v ? p.color : "none"} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-line px-2 h-9">
            <Repeat size={15} className="text-muted" />
            <select value={rec} onChange={(e) => setRec(e.target.value as Recurrence)} className="text-xs bg-transparent outline-none">
              {Object.entries(RECURRENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <select value={listId} onChange={(e) => setListId(e.target.value)} className="input h-9 w-auto flex-1 sm:flex-none text-xs">
            <option value="">📥 صندوق الوارد</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className="btn-primary mr-auto" disabled={!parsed.title || saving} onClick={() => save()}>
            إضافة {finalDue && <span className="text-[11px] opacity-80">· {friendlyDate(finalDue)}</span>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
