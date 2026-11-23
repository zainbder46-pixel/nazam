"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn, uid } from "@/lib/utils";
import type { Block, BlockType } from "@/lib/types";
import { AutoTextarea } from "./ui";

const TYPES: { type: BlockType; label: string; hint: string; icon: string; keys: string[] }[] = [
  { type: "p", label: "نص", hint: "فقرة عادية", icon: "¶", keys: ["نص", "text", "p"] },
  { type: "h1", label: "عنوان كبير", hint: "#", icon: "H1", keys: ["عنوان", "h1"] },
  { type: "h2", label: "عنوان متوسط", hint: "##", icon: "H2", keys: ["عنوان", "h2"] },
  { type: "h3", label: "عنوان صغير", hint: "###", icon: "H3", keys: ["عنوان", "h3"] },
  { type: "todo", label: "مهمة", hint: "[]", icon: "☑", keys: ["مهمة", "todo", "قائمة"] },
  { type: "bullet", label: "قائمة نقطية", hint: "-", icon: "•", keys: ["قائمة", "نقط", "bullet"] },
  { type: "number", label: "قائمة مرقمة", hint: "1.", icon: "1.", keys: ["قائمة", "رقم", "number"] },
  { type: "quote", label: "اقتباس", hint: ">", icon: "❝", keys: ["اقتباس", "quote"] },
  { type: "callout", label: "تنبيه", hint: "!", icon: "💡", keys: ["تنبيه", "ملاحظة", "callout"] },
  { type: "divider", label: "فاصل", hint: "---", icon: "—", keys: ["فاصل", "divider"] },
];

const SHORTCUTS: [string, BlockType][] = [["### ", "h3"], ["## ", "h2"], ["# ", "h1"], ["- ", "bullet"], ["* ", "bullet"], ["[] ", "todo"], ["> ", "quote"], ["1. ", "number"], ["! ", "callout"]];
const CONTINUE: BlockType[] = ["todo", "bullet", "number"];

export function BlockEditor({ blocks, onChange, readOnly }: { blocks: Block[]; onChange: (b: Block[]) => void; readOnly?: boolean }) {
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [focus, setFocus] = useState<{ id: string; at: "start" | "end" } | null>(null);
  const [menu, setMenu] = useState<{ id: string; idx: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const list = blocks.length ? blocks : [{ id: "first", type: "p" as BlockType, text: "" }];

  useEffect(() => {
    if (!focus) return;
    const el = refs.current[focus.id];
    if (el) { el.focus(); const p = focus.at === "start" ? 0 : el.value.length; el.setSelectionRange(p, p); }
    setFocus(null);
  }, [focus, blocks]);

  const set = (id: string, patch: Partial<Block>) => onChange(list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const insertAfter = (id: string, type: BlockType = "p", text = "") => {
    const nb: Block = { id: uid(), type, text, ...(type === "todo" ? { checked: false } : {}) };
    const i = list.findIndex((b) => b.id === id);
    onChange([...list.slice(0, i + 1), nb, ...list.slice(i + 1)]);
    setFocus({ id: nb.id, at: "start" });
  };

  const options = (b: Block) => {
    const q = b.text.slice(1).trim();
    return TYPES.filter((t) => !q || t.label.includes(q) || t.keys.some((k) => k.startsWith(q)));
  };

  const applyType = (b: Block, type: BlockType) => {
    setMenu(null);
    if (type === "divider") {
      const i = list.findIndex((x) => x.id === b.id);
      const nb: Block = { id: uid(), type: "p", text: "" };
      onChange([...list.slice(0, i), { ...b, type: "divider", text: "" }, nb, ...list.slice(i + 1)]);
      setFocus({ id: nb.id, at: "start" });
      return;
    }
    set(b.id, { type, text: "", ...(type === "todo" ? { checked: false } : {}) });
    setFocus({ id: b.id, at: "end" });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block, i: number) => {
    const el = e.currentTarget;
    if (menu?.id === b.id) {
      const opts = options(b);
      if (e.key === "ArrowDown") { e.preventDefault(); setMenu({ ...menu, idx: (menu.idx + 1) % opts.length }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenu({ ...menu, idx: (menu.idx - 1 + opts.length) % opts.length }); return; }
      if (e.key === "Enter") { e.preventDefault(); if (opts[menu.idx]) applyType(b, opts[menu.idx].type); return; }
      if (e.key === "Escape") { setMenu(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (CONTINUE.includes(b.type) && !b.text) { set(b.id, { type: "p" }); return; }
      const pos = el.selectionStart;
      const before = b.text.slice(0, pos), after = b.text.slice(pos);
      const nb: Block = { id: uid(), type: CONTINUE.includes(b.type) ? b.type : "p", text: after, ...(b.type === "todo" ? { checked: false } : {}) };
      onChange([...list.slice(0, i), { ...b, text: before }, nb, ...list.slice(i + 1)]);
      setFocus({ id: nb.id, at: "start" });
    } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.type !== "p") { e.preventDefault(); set(b.id, { type: "p" }); return; }
      if (i > 0) {
        e.preventDefault();
        let prevIdx = i - 1;
        if (list[prevIdx].type === "divider") { onChange(list.filter((_, k) => k !== prevIdx)); return; }
        const prev = list[prevIdx];
        const caret = prev.text.length;
        onChange(list.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x)));
        setTimeout(() => { const pe = refs.current[prev.id]; if (pe) { pe.focus(); pe.setSelectionRange(caret, caret); } }, 0);
      }
    } else if (e.key === "ArrowUp" && el.selectionStart === 0 && i > 0) {
      e.preventDefault(); const p = list.slice(0, i).reverse().find((x) => x.type !== "divider"); if (p) setFocus({ id: p.id, at: "end" });
    } else if (e.key === "ArrowDown" && el.selectionStart === el.value.length && i < list.length - 1) {
      e.preventDefault(); const n = list.slice(i + 1).find((x) => x.type !== "divider"); if (n) setFocus({ id: n.id, at: "start" });
    }
  };

  const onText = (b: Block, text: string) => {
    for (const [pre, type] of SHORTCUTS) {
      if (b.type === "p" && text.startsWith(pre)) { set(b.id, { type, text: text.slice(pre.length), ...(type === "todo" ? { checked: false } : {}) }); return; }
    }
    if (b.type === "p" && text === "---") { applyType(b, "divider"); return; }
    set(b.id, { text });
    setMenu(text.startsWith("/") ? { id: b.id, idx: 0 } : null);
  };

  let num = 0;
  return (
    <div className="space-y-0.5">
      {list.map((b, i) => {
        num = b.type === "number" ? num + 1 : 0;
        const style = {
          p: "text-[15px] leading-7", h1: "text-3xl font-bold leading-[1.4] mt-4", h2: "text-2xl font-bold leading-[1.4] mt-3",
          h3: "text-lg font-semibold leading-8 mt-2", todo: "text-[15px] leading-7", bullet: "text-[15px] leading-7",
          number: "text-[15px] leading-7", quote: "text-[15px] leading-7 italic text-ink/80", callout: "text-[15px] leading-7", divider: "",
        }[b.type];
        return (
          <div key={b.id} className={cn("group relative flex items-start gap-1 -mr-8 pr-8", drag === b.id && "opacity-40")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!drag || drag === b.id) return;
              const moving = list.find((x) => x.id === drag)!;
              const rest = list.filter((x) => x.id !== drag);
              const j = rest.findIndex((x) => x.id === b.id);
              onChange([...rest.slice(0, j), moving, ...rest.slice(j)]);
            }}>
            {!readOnly && (
              <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag(b.id); }} onDragEnd={() => setDrag(null)}
                className="absolute right-0 top-1.5 opacity-0 group-hover:opacity-100 cursor-grab text-muted"><GripVertical size={16} /></span>
            )}

            {b.type === "divider" ? <hr className="w-full my-4 border-line" /> : (
              <div className={cn("flex-1 flex items-start gap-2 min-w-0",
                b.type === "quote" && "border-r-4 border-gold/60 pr-3",
                b.type === "callout" && "bg-gold/10 rounded-xl px-3 py-2")}>
                {b.type === "todo" && (
                  <input type="checkbox" checked={!!b.checked} disabled={readOnly} onChange={() => set(b.id, { checked: !b.checked })}
                    className="mt-[7px] h-4 w-4 accent-[rgb(var(--brand))] shrink-0" />
                )}
                {b.type === "bullet" && <span className="mt-[2px] text-xl leading-6 text-muted shrink-0">•</span>}
                {b.type === "number" && <span className="leading-7 text-muted shrink-0 tabular-nums">{num}.</span>}
                {b.type === "callout" && <span className="leading-7 shrink-0">💡</span>}
                <AutoTextarea value={b.text} readOnly={readOnly} onEl={(el) => (refs.current[b.id] = el)}
                  onChange={(e) => onText(b, e.target.value)} onKeyDown={(e) => onKey(e, b, i)}
                  onBlur={() => setTimeout(() => setMenu((m) => (m?.id === b.id ? null : m)), 150)}
                  placeholder={i === 0 && list.length === 1 ? "ابدأ الكتابة، أو اكتب / للأوامر" : b.type.startsWith("h") ? "عنوان" : ""}
                  className={cn(style, "placeholder:text-muted/60", b.type === "todo" && b.checked && "line-through text-muted")} />
              </div>
            )}

            {menu?.id === b.id && (
              <div className="absolute z-30 top-full right-8 mt-1 w-64 card p-1.5 anim-pop">
                <p className="px-2 py-1 text-[11px] text-muted">نوع الكتلة</p>
                {options(b).map((t, k) => (
                  <button key={t.type} onMouseDown={(e) => { e.preventDefault(); applyType(b, t.type); }}
                    className={cn("w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm", k === menu.idx ? "bg-ink/5" : "hover:bg-ink/5")}>
                    <span className="h-8 w-8 rounded-lg border border-line flex items-center justify-center text-xs font-bold">{t.icon}</span>
                    <span className="flex-1 text-right">{t.label}</span><span className="text-[11px] text-muted" dir="ltr">{t.hint}</span>
                  </button>
                ))}
                {options(b).length === 0 && <p className="px-2 py-2 text-sm text-muted">ما فيه نتائج</p>}
              </div>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <div className="h-24 cursor-text" onClick={() => {
          const last = list[list.length - 1];
          if (last.type === "p" && !last.text) setFocus({ id: last.id, at: "end" });
          else insertAfter(last.id);
        }} />
      )}
    </div>
  );
}
