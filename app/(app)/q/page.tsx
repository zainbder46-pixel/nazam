"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { supabase } from "@/lib/supabase/client";
import { pushUndo } from "@/lib/undo";
import { addDays, cn, money, today } from "@/lib/utils";
import type { Category } from "@/lib/types";

/** صرفية سريعة — تفتح من اختصار «النقر على الخلف» في الآيفون: /q أو /q?amount=25 */
export default function QuickExpense() {
  const { workspaces, profile } = useApp();
  const cur = profile?.currency ?? "ر.س";
  const [wsId, setWsId] = useState<string | null>(null);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [cat, setCat] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ amount: number; cat?: Category } | null>(null);
  const [todaySum, setTodaySum] = useState(0);
  const amountRef = useRef<HTMLInputElement>(null);

  // المبلغ والملاحظة من رابط الاختصار
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const a = p.get("amount")?.replace(/[^\d.٠-٩]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (a) setAmount(a);
    if (p.get("note")) setNote(p.get("note")!);
    if (p.get("type") === "income") setType("income");
    setTimeout(() => amountRef.current?.focus(), 50);
  }, []);

  // المساحة الافتراضية: «حياتي»
  useEffect(() => {
    if (!wsId && workspaces.length) setWsId((workspaces.find((w) => w.is_personal) ?? workspaces[0]).id);
  }, [workspaces, wsId]);

  useEffect(() => {
    if (!wsId) return;
    const sb = supabase();
    sb.from("fin_categories").select("*").eq("workspace_id", wsId).then(({ data }) => setCats(data ?? []));
    sb.from("transactions").select("category_id,amount,type,date").eq("workspace_id", wsId).gte("date", addDays(today(), -60)).then(({ data }) => {
      const u: Record<string, number> = {};
      (data ?? []).forEach((t: any) => { if (t.category_id) u[t.category_id] = (u[t.category_id] ?? 0) + 1; });
      setUsage(u);
      setTodaySum((data ?? []).filter((t: any) => t.type === "expense" && t.date === today()).reduce((s: number, t: any) => s + Number(t.amount), 0));
    });
  }, [wsId, saved]);

  const typeCats = useMemo(() => cats.filter((c) => c.type === type).sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0)), [cats, type, usage]);
  useEffect(() => { if (!typeCats.some((c) => c.id === cat)) setCat(typeCats[0]?.id ?? null); }, [typeCats]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = Number(amount);
  const save = async () => {
    if (!wsId || !n || n <= 0 || saving) return;
    setSaving(true);
    const { data } = await supabase().from("transactions")
      .insert({ workspace_id: wsId, type, amount: n, category_id: cat, note: note.trim() || null, date })
      .select("id").single();
    setSaving(false);
    const c = cats.find((x) => x.id === cat);
    if (data?.id) {
      pushUndo(`سجّلت ${type === "expense" ? "صرفية" : "دخل"} ${money(n, cur)}`, async () => {
        await supabase().from("transactions").delete().eq("id", data.id);
        setSaved(null);
      });
    }
    setSaved({ amount: n, cat: c });
    try { navigator.vibrate?.(30); } catch {}
  };

  const again = () => { setSaved(null); setAmount(""); setNote(""); setDate(today()); setTimeout(() => amountRef.current?.focus(), 50); };

  if (saved) return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center anim-rise">
      <div className="h-20 w-20 rounded-full bg-brand text-white flex items-center justify-center anim-check"><Check size={40} strokeWidth={3} /></div>
      <p className="text-2xl font-bold mt-5">{money(saved.amount, cur)}</p>
      <p className="text-muted mt-1">{saved.cat ? `${saved.cat.icon} ${saved.cat.name}` : ""} · تم التسجيل</p>
      <p className="text-xs text-muted mt-3">مصروفك اليوم: {money(todaySum, cur)}</p>
      <div className="flex gap-2 mt-8 w-full max-w-xs">
        <button onClick={again} className="btn-primary flex-1 h-12">سجّل ثانية</button>
        <Link href="/finance" className="btn-outline flex-1 h-12">المالية</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col max-w-md mx-auto px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Link href="/" className="icon-btn"><X size={20} /></Link>
        <div className="inline-flex p-1 rounded-xl bg-ink/5">
          {(["expense", "income"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={cn("px-4 h-8 rounded-lg text-sm", type === t ? "bg-surface shadow-soft font-semibold" : "text-muted")}>
              {t === "expense" ? "صرفية" : "دخل"}
            </button>
          ))}
        </div>
        <select value={wsId ?? ""} onChange={(e) => setWsId(e.target.value)} className="bg-transparent text-sm text-muted outline-none max-w-[110px]">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
        </select>
      </div>

      <div className="flex-1 flex flex-col justify-center py-6">
        <label className="text-center text-sm text-muted mb-2">{type === "expense" ? "كم صرفت؟" : "كم دخل؟"}</label>
        <div className="flex items-baseline justify-center gap-2" dir="ltr">
          <input ref={amountRef} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && save()}
            inputMode="decimal" placeholder="0" autoFocus
            className={cn("w-full text-center bg-transparent outline-none font-bold tabular-nums placeholder:text-ink/15", amount.length > 6 ? "text-5xl" : "text-7xl", type === "expense" ? "text-ink" : "text-green-600")} />
        </div>
        <p className="text-center text-muted text-sm mt-1">{cur}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {typeCats.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={cn("h-10 px-3.5 rounded-full border text-sm transition", cat === c.id ? "border-transparent text-white font-semibold" : "border-line")}
              style={cat === c.id ? { background: c.color } : {}}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="وش هو؟ (اختياري)" className="input h-12 mt-6 text-center" />

        <div className="flex justify-center gap-2 mt-3">
          {[{ l: "اليوم", v: today() }, { l: "أمس", v: addDays(today(), -1) }].map((o) => (
            <button key={o.l} onClick={() => setDate(o.v)} className={cn("chip h-8 px-4 text-xs border", date === o.v ? "bg-ink text-bg border-transparent" : "border-line text-muted")}>{o.l}</button>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={!n || n <= 0 || saving || !wsId} className="btn-primary h-14 text-lg rounded-2xl w-full">
        {saving ? "يحفظ..." : `حفظ ${n > 0 ? money(n, cur) : ""}`}
      </button>
    </div>
  );
}
