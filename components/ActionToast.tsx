"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";
import { canUndo, undoLast, type Celebration } from "@/lib/undo";
import { friendlyDate } from "@/lib/utils";

const PRAISE = ["أحسنت! 💪", "كفو عليك! 🔥", "إنجاز جميل ✨", "استمر كذا 👏", "بطل 🏆", "تمام التمام ✅", "خطوة لقدام 🚀"];
const COLORS = ["#0f766e", "#d6aa5a", "#2563eb", "#db2777", "#16a34a", "#f59e0b", "#7c3aed"];

type Toast = { key: number; label: string; celebrate?: Celebration; praise: string; undone?: boolean };
type Burst = { key: number; x: number; y: number; bits: { dx: number; dy: number; r: number; c: string; d: number }[] };

function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [[880, 0], [1318.5, 0.09]].forEach(([f, t]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* المتصفح ما يدعم الصوت */ }
}

export function ActionToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (t: Toast, ms = 5000) => {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  };

  const doUndo = async () => {
    if (busy) return;
    setBusy(true);
    await undoLast();
    setBusy(false);
  };

  useEffect(() => {
    const onAction = (e: Event) => {
      const { label, celebrate } = (e as CustomEvent).detail as { label: string; celebrate?: Celebration };
      show({ key: Date.now(), label, celebrate, praise: PRAISE[Math.floor(Math.random() * PRAISE.length)] }, 8000);
      if (celebrate) {
        chime();
        const x = celebrate.x ?? window.innerWidth / 2, y = celebrate.y ?? window.innerHeight / 2;
        const bits = Array.from({ length: 22 }, (_, i) => ({
          dx: Math.cos((i / 22) * Math.PI * 2) * (60 + Math.random() * 90),
          dy: Math.sin((i / 22) * Math.PI * 2) * (50 + Math.random() * 70) + 60,
          r: Math.random() * 540 - 270, c: COLORS[i % COLORS.length], d: Math.random() * 120,
        }));
        const key = Date.now() + Math.random();
        setBursts((b) => [...b, { key, x, y, bits }]);
        setTimeout(() => setBursts((b) => b.filter((z) => z.key !== key)), 1300);
      }
    };
    const onUndone = (e: Event) => {
      const { label } = (e as CustomEvent).detail as { label: string };
      show({ key: Date.now(), label: `تم التراجع: ${label}`, praise: "", undone: true }, 2500);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && canUndo()) { e.preventDefault(); doUndo(); }
    };
    window.addEventListener("nz:action", onAction);
    window.addEventListener("nz:undone", onUndone);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("nz:action", onAction);
      window.removeEventListener("nz:undone", onUndone);
      window.removeEventListener("keydown", onKey);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {bursts.map((b) => b.bits.map((p, i) => (
        <span key={`${b.key}-${i}`} className="confetti"
          style={{ left: b.x, top: b.y, background: p.c, animationDelay: `${p.d}ms`, ["--dx" as any]: `${p.dx}px`, ["--dy" as any]: `${p.dy}px`, ["--r" as any]: `${p.r}deg` }} />
      )))}

      {toast && (
        <div key={toast.key} className="toast fixed z-[60] left-1/2 bottom-24 lg:bottom-8 w-[calc(100%-2rem)] max-w-md"
          onMouseEnter={() => { if (timer.current) clearTimeout(timer.current); }}
          onMouseLeave={() => { timer.current = setTimeout(() => setToast(null), 3000); }}>
          <div className={toast.celebrate ? "card p-4 border-brand/40 shadow-2xl" : "card px-4 py-3 shadow-2xl"}>
            <div className="flex items-center gap-3">
              {toast.celebrate ? <span className="text-3xl anim-check">🎉</span> : toast.undone ? <span className="text-xl">↩️</span> : null}
              <div className="flex-1 min-w-0">
                {toast.celebrate ? (
                  <>
                    <p className="font-bold">{toast.praise}</p>
                    <p className="text-sm text-muted truncate">أنجزت «{toast.celebrate.title}»</p>
                    {toast.celebrate.recurring && toast.celebrate.next && (
                      <p className="text-xs text-brand mt-0.5">🔁 مهمة متكررة — موعدها الجاي: {friendlyDate(toast.celebrate.next)}</p>
                    )}
                  </>
                ) : <p className="text-sm truncate">{toast.label}</p>}
              </div>
              {!toast.undone && (
                <button onClick={doUndo} disabled={busy} className="btn-outline h-9 px-3 shrink-0">
                  <Undo2 size={15} /> تراجع
                </button>
              )}
              <button onClick={() => setToast(null)} className="icon-btn h-7 w-7 shrink-0"><X size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
