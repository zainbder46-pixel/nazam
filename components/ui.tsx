"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/30 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={cn("card w-full anim-pop max-h-[88vh] overflow-auto rounded-b-none sm:rounded-2xl pb-[env(safe-area-inset-bottom)]", wide ? "sm:max-w-2xl" : "sm:max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h3 className="font-semibold">{title}</h3>
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        )}
        <div className="px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={cn("fixed inset-0 z-40 bg-black/20 transition-opacity", open ? "opacity-100" : "opacity-0 pointer-events-none")} onClick={onClose} />
      <aside className={cn("fixed top-0 left-0 z-50 h-full w-full sm:w-[440px] bg-surface border-r border-line shadow-2xl transition-transform duration-300 overflow-y-auto", open ? "translate-x-0" : "-translate-x-full")}>
        {open && children}
      </aside>
    </>
  );
}

export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 rounded-full bg-ink/5 overflow-hidden", className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${v}%`, background: color ?? "rgb(var(--brand))" }} />
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 6, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--ink) / .07)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? "rgb(var(--brand))"} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">{children}</div>
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 max-w-full">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto no-scrollbar p-1 rounded-xl bg-ink/5 gap-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("shrink-0 whitespace-nowrap px-3 h-8 rounded-lg text-sm transition", value === o.value ? "bg-surface shadow-soft font-medium" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { onEl?: (el: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { onEl, ...rest } = props;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "0px"; el.style.height = el.scrollHeight + "px";
  }, [props.value]);
  return <textarea rows={1} {...rest} ref={(el) => { ref.current = el; onEl?.(el); }} className={cn("resize-none overflow-hidden bg-transparent outline-none w-full", props.className)} />;
}

export function Spinner() {
  return <div className="flex justify-center py-16"><div className="h-6 w-6 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>;
}
