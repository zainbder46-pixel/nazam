"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis } from "recharts";
import { useApp } from "@/components/AppProvider";
import { Empty, Modal, PageHeader, Progress, Segmented } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { cn, money, parseYmd, today, ymd } from "@/lib/utils";
import type { Account, Category, Goal, Income, Obligation, Transaction, Wallet } from "@/lib/types";
import { Accounts, AccountSelect, TxRow, kindOf } from "@/components/Wallets";

type Tab = "summary" | "accounts" | "tx" | "plan" | "savings";
const n = (x: unknown) => Number(x ?? 0);

/** أرقام الشهر الحقيقية: بدون الأمانات وبدون التحويلات الداخلية */
function monthStats(tx: Transaction[], cats: Category[], accounts: Account[], wallets: Wallet[]) {
  const real = tx.filter((t) => t.nature !== "custody" && t.type !== "transfer");
  const debtCats = new Set(cats.filter((c) => c.kind === "debt").map((c) => c.id));
  const savingIds = new Set(accounts.filter((a) => kindOf(a, wallets) === "savings").map((a) => a.id));
  const income = real.filter((t) => t.type === "income").reduce((s, t) => s + n(t.amount), 0);
  const debt = real.filter((t) => t.type === "expense" && debtCats.has(t.category_id ?? "")).reduce((s, t) => s + n(t.amount), 0);
  const living = real.filter((t) => t.type === "expense" && !debtCats.has(t.category_id ?? "")).reduce((s, t) => s + n(t.amount), 0);
  const saved = tx.filter((t) => t.type === "transfer").reduce((s, t) => {
    const into = savingIds.has(t.to_account_id ?? ""), outOf = savingIds.has(t.account_id ?? "");
    return s + (into && !outOf ? n(t.amount) : outOf && !into ? -n(t.amount) : 0);
  }, 0);
  return { real, income, debt, living, saved, debtCats };
}

export default function FinancePage() {
  const { profile, ws, canEdit, updateProfile } = useApp();
  const cur = profile?.currency ?? "ر.س";
  const wsId = ws?.id ?? "";
  const [tab, setTab] = useState<Tab>("summary");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [cats, setCats] = useState<Category[]>([]);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [obl, setObl] = useState<Obligation[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);

  const from = ymd(month), to = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const loadTx = () => wsId && supabase().from("transactions").select("*").eq("workspace_id", wsId).gte("date", from).lte("date", to).order("date", { ascending: false }).order("created_at", { ascending: false }).then(({ data }) => setTx(data ?? []));
  const loadCats = () => wsId && supabase().from("fin_categories").select("*").eq("workspace_id", wsId).order("created_at").then(({ data }) => setCats(data ?? []));
  const loadObl = () => wsId && supabase().from("obligations").select("*").eq("workspace_id", wsId).eq("active", true).order("created_at").then(({ data }) => setObl(data ?? []));
  const loadGoals = () => wsId && supabase().from("savings_goals").select("*").eq("workspace_id", wsId).order("priority").order("created_at").then(({ data }) => setGoals(data ?? []));
  const loadIncomes = () => wsId && supabase().from("fin_incomes").select("*").eq("workspace_id", wsId).eq("active", true).order("position").order("created_at").then(({ data }) => setIncomes(data ?? []));
  const loadWallets = async () => {
    if (!wsId) return;
    const sb = supabase();
    const [w, a, b] = await Promise.all([
      sb.from("fin_wallets").select("*").eq("workspace_id", wsId).eq("archived", false).order("position").order("created_at"),
      sb.from("fin_accounts").select("*").eq("workspace_id", wsId).order("position").order("created_at"),
      sb.from("fin_account_balances").select("account_id,balance").eq("workspace_id", wsId),
    ]);
    const bal = new Map((b.data ?? []).map((x: { account_id: string; balance: number }) => [x.account_id, Number(x.balance)]));
    setWallets(w.data ?? []);
    setAccounts(((a.data ?? []) as Account[]).map((x) => ({ ...x, balance: bal.get(x.id) ?? Number(x.opening_balance) })));
  };
  const reloadMoney = () => { loadTx(); loadWallets(); };
  useEffect(() => { loadCats(); loadObl(); loadGoals(); loadWallets(); loadIncomes(); }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadTx(); }, [from, wsId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const on = () => { reloadMoney(); loadGoals(); }; window.addEventListener("nz:refresh", on); return () => window.removeEventListener("nz:refresh", on); }); // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" }).format(month);
  const mineAccs = accounts.filter((a) => kindOf(a, wallets) === "mine");
  const defAcc = (mineAccs.find((a) => a.is_default) ?? mineAccs[0])?.id ?? "";
  const common = { cats, tx, cur, wsId, wallets, accounts, canEdit };

  return (
    <div>
      <PageHeader title="المالية" subtitle={ws ? `${ws.icon} مالية «${ws.name}»${ws.is_personal ? " — خاصة فيك" : ""}` : ""} actions={
        <Segmented value={tab} onChange={setTab} options={[{ value: "summary", label: "الملخص" }, { value: "accounts", label: "الحسابات" }, { value: "tx", label: "العمليات" }, { value: "plan", label: "الخطة" }, { value: "savings", label: "الادخار" }]} />
      } />

      {(tab === "summary" || tab === "tx" || tab === "plan") && (
        <div className="flex items-center gap-2 mb-5">
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronRight size={18} /></button>
          <span className="font-semibold min-w-[120px] text-center">{monthLabel}</span>
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronLeft size={18} /></button>
        </div>
      )}

      {!canEdit && <p className="card px-4 py-3 mb-5 text-sm text-muted">👀 صلاحيتك في هذي المساحة مشاهدة فقط</p>}
      {tab === "summary" && <Summary {...common} month={month} incomes={incomes} obl={obl} goals={goals} profile={profile} defAcc={defAcc} reload={() => { reloadMoney(); loadIncomes(); }} go={setTab} />}
      {tab === "accounts" && <Accounts wallets={wallets} accounts={accounts} tx={tx} cats={cats} cur={cur} wsId={wsId} canEdit={canEdit} reload={reloadMoney} />}
      {tab === "tx" && <Ledger {...common} month={month} defAcc={defAcc} reload={reloadMoney} />}
      {tab === "plan" && (
        <div className="space-y-8">
          <div><h2 className="font-bold mb-3">🧮 ميزانية المعيشة</h2><Budget cats={cats} tx={tx} cur={cur} reload={loadCats} wsId={wsId} /></div>
          <div><h2 className="font-bold mb-3">🧾 الالتزامات والديون</h2><Obligations items={obl} cur={cur} reload={loadObl} cats={cats} wsId={wsId} defAcc={defAcc} /></div>
        </div>
      )}
      {tab === "savings" && <Savings {...common} goals={goals} incomes={incomes} profile={profile} updateProfile={updateProfile} defAcc={defAcc} reload={() => { loadGoals(); reloadMoney(); }} />}
    </div>
  );
}

type Common = { cats: Category[]; tx: Transaction[]; cur: string; wsId: string; wallets: Wallet[]; accounts: Account[]; canEdit: boolean };
type Prof = { save_fixed_pct?: number; save_var_pct?: number } | null;

/* ---------------- الملخص ---------------- */
function Summary({ cats, tx, cur, wsId, wallets, accounts, canEdit, month, incomes, obl, goals, profile, defAcc, reload, go }: Common & {
  month: Date; incomes: Income[]; obl: Obligation[]; goals: Goal[]; profile: Prof; defAcc: string; reload: () => void; go: (t: Tab) => void;
}) {
  const [recv, setRecv] = useState<Income | null>(null);
  const [editInc, setEditInc] = useState<Income | "new" | null>(null);
  const sumOf = (k: Wallet["kind"]) => accounts.filter((a) => kindOf(a, wallets) === k).reduce((s, a) => s + n(a.balance), 0);
  const spendable = sumOf("mine"), saving = sumOf("savings"), custody = sumOf("custody");
  const st = monthStats(tx, cats, accounts, wallets);

  const now = new Date(); const td = now.getDate();
  const isThisMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const got = (i: Income) => tx.filter((t) => t.income_id === i.id).reduce((s, t) => s + n(t.amount), 0);
  const fixed = incomes.filter((i) => !i.variable);
  const expected = fixed.reduce((s, i) => s + n(i.amount), 0) + incomes.filter((i) => i.variable).reduce((s, i) => s + n(i.min_amount ?? i.amount), 0);

  // متى يجيك الدخل الثابت الجاي؟
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const nextDays = fixed.filter((i) => i.day).map((i) => (i.day! > td || (i.day! === td && !got(i))) ? i.day! - td : i.day! + dim - td);
  const daysLeft = Math.max(1, nextDays.length ? Math.min(...nextDays) : dim - td + 1);
  const dueSoon = obl.filter((o) => (o.kind === "bill" || o.kind === "installment") && o.due_day).filter((o) => { const d = (o.due_day! - td + dim) % dim; return d < daysLeft; }).reduce((s, o) => s + n(o.amount), 0);
  const daily = Math.max(0, spendable - dueSoon) / daysLeft;
  const rate = st.income ? Math.round((st.saved / st.income) * 100) : 0;

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    st.real.filter((t) => t.type === "expense" && !st.debtCats.has(t.category_id ?? "")).forEach((t) => m.set(t.category_id ?? "x", (m.get(t.category_id ?? "x") ?? 0) + n(t.amount)));
    return [...m.entries()].map(([id, v]) => { const c = cats.find((x) => x.id === id); return { id, name: c ? `${c.icon} ${c.name}` : "بدون تصنيف", v, color: c?.color ?? "#94a3b8", b: n(c?.monthly_budget) }; }).sort((a, b) => b.v - a.v);
  }, [tx, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = goals.find((g) => n(g.saved) < n(g.target));

  return (
    <div className="space-y-5">
      {isThisMonth && (
        <section className="card p-5 bg-gradient-to-l from-brand to-teal-700 text-white border-0">
          <p className="text-sm text-white/80">تقدر تصرف يوميًا</p>
          <p className="text-4xl font-bold mt-1">{money(Math.floor(daily), cur)}</p>
          <p className="text-sm text-white/85 mt-2">
            معك {money(spendable, cur)}{dueSoon ? ` − التزامات قريبة ${money(dueSoon, cur)}` : ""} ÷ {daysLeft} يوم {nextDays.length ? "لين يجيك الدخل الجاي" : "لنهاية الشهر"}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-white/15 text-sm">
            <span>💎 صافي فلوسك {money(spendable + saving, cur)}</span>
            <span>🐷 مدخر {money(saving, cur)}</span>
            {custody > 0 && <button onClick={() => go("accounts")} className="text-white/70 underline-offset-2 hover:underline">🤝 أمانات {money(custody, cur)} (مو لك)</button>}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { l: "دخل الشهر", v: money(st.income, cur), s: expected ? `المتوقع ${money(expected, cur)}` : "", c: "text-green-600" },
          { l: "مصروف المعيشة", v: money(st.living, cur), s: st.debt ? `+ سداد ديون ${money(st.debt, cur)}` : "", c: "text-red-600" },
          { l: "ادخرت", v: money(st.saved, cur), s: st.income ? `${rate}% من دخلك` : "", c: "text-gold" },
          { l: "الصافي", v: money(st.income - st.living - st.debt, cur), s: "دخل − مصروف", c: st.income - st.living - st.debt >= 0 ? "text-brand" : "text-red-600" },
        ].map((x) => (
          <div key={x.l} className="card p-3 sm:p-4 min-w-0">
            <p className="text-[11px] sm:text-xs text-muted">{x.l}</p>
            <p className={cn("text-base sm:text-xl font-bold truncate", x.c)}>{x.v}</p>
            {x.s && <p className="text-[10px] sm:text-[11px] text-muted truncate">{x.s}</p>}
          </div>
        ))}
      </div>

      <section className="card p-2">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h3 className="font-semibold">💰 مصادر دخلك</h3>
          {canEdit && <button onClick={() => setEditInc("new")} className="btn-ghost h-8 text-xs text-brand"><Plus size={14} /> مصدر</button>}
        </div>
        {!incomes.length && <p className="text-sm text-muted px-3 pb-3">أضف الراتب، المصروف، والفري لانس عشان نعرف وش متوقع يجيك كل شهر.</p>}
        {incomes.map((i) => {
          const g = got(i); const done = !i.variable && g >= n(i.amount) * 0.95;
          return (
            <div key={i.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ink/[.03]">
              <span className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center text-lg">{i.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{i.name}</p>
                <p className="text-[11px] text-muted">{i.variable ? `متغير · المتوسط ${money(n(i.amount), cur)}${i.min_amount ? ` · أقل شهر ${money(n(i.min_amount), cur)}` : ""}` : `${money(n(i.amount), cur)}${i.day ? ` · يوم ${i.day}` : ""}`}</p>
              </div>
              {g > 0 && <span className="text-xs text-green-700 font-semibold">{done ? <Check size={14} className="inline" /> : null} {money(g, cur)}</span>}
              {canEdit && !done && <button onClick={() => setRecv(i)} className="btn-outline h-8 text-xs">{i.variable && g ? "+ دفعة" : "استلمته"}</button>}
              {canEdit && <button onClick={() => setEditInc(i)} className="icon-btn h-8 w-8 sm:opacity-0 group-hover:opacity-100"><Pencil size={13} /></button>}
            </div>
          );
        })}
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">وين راحت فلوسك</h3><button onClick={() => go("tx")} className="text-xs text-brand">كل العمليات</button></div>
          {!byCat.length ? <Empty icon="📊" title="ما فيه مصاريف هالشهر" /> : (
            <div className="space-y-3">
              {byCat.slice(0, 7).map((c) => (
                <div key={c.id}>
                  <div className="flex justify-between text-sm mb-1"><span>{c.name}</span><span className={cn("font-medium", !!c.b && c.v > c.b && "text-red-600")}>{money(c.v, cur)}{c.b ? <span className="text-muted text-xs font-normal"> / {money(c.b, cur)}</span> : null}</span></div>
                  <Progress value={c.b ? (c.v / c.b) * 100 : (c.v / byCat[0].v) * 100} color={c.b && c.v > c.b ? "#ef4444" : c.color} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">🐷 الادخار</h3><button onClick={() => go("savings")} className="text-xs text-brand">الخطة والأهداف</button></div>
          {top ? (
            <div>
              <div className="flex justify-between text-sm mb-1.5"><span>{top.icon} {top.name}</span><span className="font-medium">{money(n(top.saved), cur)} <span className="text-muted text-xs">/ {money(n(top.target), cur)}</span></span></div>
              <Progress value={(n(top.saved) / n(top.target)) * 100} color="rgb(var(--gold))" className="h-2.5" />
              {top.note && <p className="text-[11px] text-muted mt-2 leading-5">{top.note}</p>}
            </div>
          ) : <p className="text-sm text-muted">ما عندك هدف ادخار نشط.</p>}
          {obl.filter((o) => o.due_day).length > 0 && (
            <div className="pt-3 border-t border-line">
              <p className="text-xs text-muted mb-2">⏰ التزامات قريبة</p>
              {obl.filter((o) => o.due_day).map((o) => ({ o, d: (o.due_day! - td + dim) % dim })).sort((a, b) => a.d - b.d).slice(0, 3).map(({ o, d }) => (
                <div key={o.id} className="flex justify-between text-sm py-0.5"><span>{o.name} <span className="text-[11px] text-muted">{d === 0 ? "اليوم" : `بعد ${d} يوم`}</span></span><span className="font-medium">{money(n(o.amount), cur)}</span></div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ReceiveModal inc={recv} onClose={() => setRecv(null)} {...{ wsId, wallets, accounts, cats, cur, defAcc, profile }} onSaved={() => { setRecv(null); reload(); }} />
      <IncomeModal value={editInc} onClose={() => setEditInc(null)} wsId={wsId} wallets={wallets} accounts={accounts} cats={cats} onSaved={() => { setEditInc(null); reload(); }} />
    </div>
  );
}

/** استلام دخل + «ادفع لنفسك أول»: يحوّل نسبة الادخار مباشرة */
function ReceiveModal({ inc, onClose, wsId, wallets, accounts, cats, cur, defAcc, profile, onSaved }: {
  inc: Income | null; onClose: () => void; wsId: string; wallets: Wallet[]; accounts: Account[]; cats: Category[]; cur: string; defAcc: string; profile: Prof; onSaved: () => void;
}) {
  const [k, setK] = useState<string | null>(null);
  const [amt, setAmt] = useState(""); const [acc, setAcc] = useState(""); const [date, setDate] = useState(today()); const [save, setSave] = useState(true); const [saveAmt, setSaveAmt] = useState("");
  const savAcc = accounts.find((a) => kindOf(a, wallets) === "savings");
  const pct = inc?.variable ? n(profile?.save_var_pct ?? 50) : n(profile?.save_fixed_pct ?? 20);
  if ((inc?.id ?? null) !== k) {
    setK(inc?.id ?? null);
    if (inc) { setAmt(inc.variable ? "" : String(n(inc.amount))); setAcc(inc.account_id ?? defAcc); setDate(today()); setSave(!!savAcc); setSaveAmt(inc.variable ? "" : String(Math.round((n(inc.amount) * pct) / 100))); }
  }
  if (!inc) return null;
  const go = async () => {
    const v = Number(amt); if (!v) return;
    const sb = supabase();
    const cat = inc.category_id ?? cats.find((c) => c.type === "income")?.id ?? null;
    await sb.from("transactions").insert({ workspace_id: wsId, type: "income", amount: v, income_id: inc.id, category_id: cat, account_id: acc || null, note: inc.name, date });
    const s = Number(saveAmt);
    if (save && savAcc && s > 0 && acc) await sb.from("transactions").insert({ workspace_id: wsId, type: "transfer", amount: s, account_id: acc, to_account_id: savAcc.id, note: `ادخار من ${inc.name}`, date });
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`${inc.icon} استلام ${inc.name}`}>
      <div className="space-y-3">
        <input type="number" inputMode="decimal" className="input text-lg" autoFocus placeholder="المبلغ اللي وصلك" value={amt} onChange={(e) => { setAmt(e.target.value); setSaveAmt(String(Math.round((Number(e.target.value) * pct) / 100))); }} />
        <div><label className="label">وصل على</label><AccountSelect accounts={accounts} wallets={wallets} value={acc} onChange={setAcc} className="w-full" kinds={["mine"]} /></div>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        {savAcc ? (
          <div className="rounded-2xl bg-gold/10 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[rgb(var(--brand))]" /> 🐷 ادفع لنفسك أول — حوّل {pct}% للادخار الحين</label>
            {save && <input type="number" inputMode="decimal" className="input" value={saveAmt} onChange={(e) => setSaveAmt(e.target.value)} />}
            <p className="text-[11px] text-muted">يتحوّل لـ «{savAcc.name}» قبل لا تبدأ تصرف</p>
          </div>
        ) : <p className="text-[11px] text-muted">نصيحة: أضف حساب ادخار من «الحسابات» عشان نحوّل له نسبة من كل دخل تلقائيًا.</p>}
        <button className="btn-primary w-full" disabled={!Number(amt)} onClick={go}>تأكيد الاستلام{save && savAcc && Number(saveAmt) ? ` وادخار ${money(Number(saveAmt), cur)}` : ""}</button>
      </div>
    </Modal>
  );
}

function IncomeModal({ value, onClose, wsId, wallets, accounts, cats, onSaved }: { value: Income | "new" | null; onClose: () => void; wsId: string; wallets: Wallet[]; accounts: Account[]; cats: Category[]; onSaved: () => void }) {
  const edit = value && value !== "new" ? value : null;
  const [k, setK] = useState<string | null>(null);
  const blank = { name: "", icon: "💰", amount: "", min: "", day: "", variable: false, account: "", category: "" };
  const [f, setF] = useState(blank);
  const key = value === "new" ? "new" : edit?.id ?? null;
  if (key !== k) {
    setK(key);
    setF(edit ? { name: edit.name, icon: edit.icon, amount: String(n(edit.amount)), min: edit.min_amount ? String(n(edit.min_amount)) : "", day: edit.day ? String(edit.day) : "", variable: edit.variable, account: edit.account_id ?? "", category: edit.category_id ?? "" } : blank);
  }
  if (!value) return null;
  const save = async () => {
    if (!f.name.trim()) return;
    const row = { name: f.name.trim(), icon: f.icon || "💰", amount: Number(f.amount || 0), min_amount: f.variable && f.min ? Number(f.min) : null, day: !f.variable && f.day ? Number(f.day) : null, variable: f.variable, account_id: f.account || null, category_id: f.category || null };
    if (edit) await supabase().from("fin_incomes").update(row).eq("id", edit.id);
    else await supabase().from("fin_incomes").insert({ ...row, workspace_id: wsId, position: Date.now() });
    onSaved();
  };
  const del = async () => { if (!edit || !confirm(`إيقاف «${edit.name}»؟`)) return; await supabase().from("fin_incomes").update({ active: false }).eq("id", edit.id); onSaved(); };
  return (
    <Modal open onClose={onClose} title={edit ? "تعديل مصدر الدخل" : "مصدر دخل جديد"}>
      <div className="space-y-3">
        <div className="flex gap-2"><input className="input w-16 text-center text-lg" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} /><input className="input" autoFocus placeholder="مثال: الراتب، مصروف الجامعة، فري لانس" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <Segmented value={f.variable ? "v" : "f"} onChange={(v) => setF({ ...f, variable: v === "v" })} options={[{ value: "f", label: "ثابت شهري" }, { value: "v", label: "متغير" }]} />
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">{f.variable ? "المتوسط الشهري" : "المبلغ"}</label><input type="number" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          {f.variable
            ? <div><label className="label">أقل شهر متوقع</label><input type="number" className="input" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
            : <div><label className="label">يوم الاستلام</label><input type="number" min={1} max={31} className="input" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></div>}
        </div>
        <div><label className="label">يوصل على</label><AccountSelect accounts={accounts} wallets={wallets} value={f.account} onChange={(v) => setF({ ...f, account: v })} className="w-full" kinds={["mine"]} /></div>
        <div><label className="label">التصنيف</label>
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">— تلقائي —</option>
            {cats.filter((c) => c.type === "income").map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2"><button className="btn-primary flex-1" onClick={save}>حفظ</button>{edit && <button className="btn-outline text-red-600" onClick={del}><Trash2 size={15} /></button>}</div>
      </div>
    </Modal>
  );
}

/* ---------------- العمليات ---------------- */
function Ledger({ cats, tx: allTx, cur, wsId, wallets, accounts, canEdit, month, defAcc, reload }: Common & { month: Date; defAcc: string; reload: () => void }) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [f, setFilter] = useState("all");
  const [acc, setAcc] = useState("");
  const [amount, setAmount] = useState(""); const [cat, setCat] = useState(""); const [note, setNote] = useState(""); const [date, setDate] = useState(today());
  useEffect(() => {
    if (acc || !accounts.length) return;
    const last = typeof window !== "undefined" ? localStorage.getItem(`nz:acc:${wsId}`) : null;
    const ok = accounts.find((a) => a.id === last && kindOf(a, wallets) !== "custody");
    setAcc(ok?.id ?? defAcc);
  }, [accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const typeCats = cats.filter((c) => c.type === type);
  useEffect(() => { setCat(typeCats[0]?.id ?? ""); }, [type, cats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = f === "all" || f === "real" ? null : new Set([f]);
  const tx = f === "all" ? allTx : f === "real" ? allTx.filter((t) => t.nature !== "custody" && t.type !== "transfer") : allTx.filter((t) => focus!.has(t.account_id ?? "") || focus!.has(t.to_account_id ?? ""));
  const st = monthStats(allTx, cats, accounts, wallets);

  const add = async () => {
    const v = Number(amount); if (!v || v <= 0) return;
    const custody = kindOf(accounts.find((a) => a.id === acc), wallets) === "custody";
    await supabase().from("transactions").insert({ workspace_id: wsId, type, amount: v, category_id: custody ? null : cat || null, nature: custody ? "custody" : null, note: note || null, date, account_id: acc || null });
    if (acc && !custody) localStorage.setItem(`nz:acc:${wsId}`, acc);
    setAmount(""); setNote(""); reload();
  };
  const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const daily = Array.from({ length: dim }, (_, i) => {
    const d = ymd(new Date(month.getFullYear(), month.getMonth(), i + 1));
    return { day: i + 1, v: st.real.filter((t) => t.type === "expense" && t.date === d && !st.debtCats.has(t.category_id ?? "")).reduce((s, t) => s + n(t.amount), 0) };
  });

  return (
    <div className="space-y-5">
      {canEdit && (
        <section className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={type} onChange={setType} options={[{ value: "expense", label: "مصروف" }, { value: "income", label: "دخل" }]} />
            <input type="number" inputMode="decimal" className="input flex-1 min-w-[110px] sm:flex-none sm:w-28" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
              {typeCats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            {accounts.length > 0 && <AccountSelect accounts={accounts} wallets={wallets} value={acc} onChange={setAcc} kinds={["mine", "savings"]} />}
            <input className="input flex-1 min-w-[140px]" placeholder="وش هو؟" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn-primary" onClick={add}><Plus size={16} /> إضافة</button>
          </div>
          <p className="text-[11px] text-muted mt-2">حركات الأمانات (مثل فلوس الإيجار) تسجّلها من «الحسابات ← أمانات عندي» عشان ما تختلط بمصروفك.</p>
        </section>
      )}

      <section className="card p-5">
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">مصروف المعيشة اليومي</h3><span className="text-sm text-muted">{money(st.living, cur)}</span></div>
        <div className="h-36" dir="ltr">
          <ResponsiveContainer>
            <BarChart data={daily}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} interval={2} />
              <Tooltip cursor={{ fill: "rgb(var(--ink) / .04)" }} formatter={(v) => money(Number(v), cur)} labelFormatter={(l) => `يوم ${l}`} contentStyle={{ borderRadius: 12, border: "1px solid rgb(var(--line))" }} />
              <Bar dataKey="v" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-2 pt-2 pb-1">
          {[{ id: "all", l: "الكل" }, { id: "real", l: "دخل ومصروف فقط" }, ...accounts.map((a) => ({ id: a.id, l: kindOf(a, wallets) === "custody" ? `🤝 ${wallets.find((w) => w.id === a.wallet_id)?.name}` : `${a.name}` }))].map((x) => (
            <button key={x.id} onClick={() => setFilter(x.id)} className={cn("chip h-8 px-3 text-xs border shrink-0", f === x.id ? "bg-ink text-bg border-transparent" : "border-line text-muted")}>{x.l}</button>
          ))}
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {!tx.length && <Empty icon="🧾" title="ما فيه عمليات" />}
          {tx.map((t) => (
            <TxRow key={t.id} t={t} cats={cats} accounts={accounts} wallets={wallets} cur={cur} focus={focus ?? undefined}
              onDelete={canEdit ? async () => { if (!confirm("حذف العملية؟")) return; await supabase().from("transactions").delete().eq("id", t.id); reload(); } : undefined} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------- الادخار ---------------- */
function Savings({ cur, wsId, wallets, accounts, canEdit, goals, incomes, profile, updateProfile, defAcc, reload }: Common & {
  goals: Goal[]; incomes: Income[]; profile: Prof; updateProfile: (p: Record<string, number>) => Promise<void>; defAcc: string; reload: () => void;
}) {
  const [edit, setEdit] = useState<Goal | "new" | null>(null);
  const [fund, setFund] = useState<Goal | null>(null);
  const savAccs = accounts.filter((a) => kindOf(a, wallets) === "savings");
  const inSavings = savAccs.reduce((s, a) => s + n(a.balance), 0);
  const allocated = goals.reduce((s, g) => s + n(g.saved), 0);
  const fp = n(profile?.save_fixed_pct ?? 20), vp = n(profile?.save_var_pct ?? 50);
  const fixedInc = incomes.filter((i) => !i.variable).reduce((s, i) => s + n(i.amount), 0);
  const varMin = incomes.filter((i) => i.variable).reduce((s, i) => s + n(i.min_amount ?? i.amount), 0);
  const varAvg = incomes.filter((i) => i.variable).reduce((s, i) => s + n(i.amount), 0);
  const planMin = Math.round((fixedInc * fp + varMin * vp) / 100), planAvg = Math.round((fixedInc * fp + varAvg * vp) / 100);
  const active = goals.filter((g) => n(g.saved) < n(g.target));
  const planned = active.reduce((s, g) => s + n(g.monthly), 0);

  return (
    <div className="space-y-5">
      <section className="card p-5 bg-gradient-to-l from-amber-600 to-yellow-600 text-white border-0">
        <p className="text-sm text-white/80">في حسابات الادخار</p>
        <p className="text-3xl font-bold mt-1">{money(inSavings, cur)}</p>
        <p className="text-sm text-white/85 mt-2">موزّع على الأهداف {money(allocated, cur)}{inSavings - allocated > 0 ? ` · غير مخصص ${money(inSavings - allocated, cur)}` : ""}</p>
        {!savAccs.length && <p className="text-xs mt-3 bg-white/15 rounded-xl p-2.5">افتح حساب ادخار (من «الحسابات») وافصل فيه فلوس الأهداف عن فلوس الصرف.</p>}
      </section>

      <section className="card p-5">
        <h3 className="font-semibold">📐 قاعدتك: ادفع لنفسك أول</h3>
        <p className="text-xs text-muted mt-1 mb-4 leading-5">أول ما يجيك أي دخل، تحوّل النسبة للادخار قبل لا تصرف. الدخل المتغير (الفري لانس) نسبته أعلى لأنه مو مضمون، والزيادة فيه فرصة.</p>
        <div className="grid grid-cols-2 gap-3">
          {[{ k: "save_fixed_pct", l: "من الدخل الثابت", v: fp }, { k: "save_var_pct", l: "من الفري لانس / المتغير", v: vp }].map((x) => (
            <div key={x.k} className="rounded-2xl border border-line p-3">
              <p className="text-xs text-muted">{x.l}</p>
              <div className="flex items-center gap-1 mt-1">
                <input type="number" min={0} max={100} disabled={!canEdit} defaultValue={x.v} onBlur={(e) => Number(e.target.value) !== x.v && updateProfile({ [x.k]: Math.min(100, Math.max(0, Number(e.target.value))) })} className="input h-10 w-20 text-center text-lg font-bold" />
                <span className="text-lg font-bold">%</span>
              </div>
            </div>
          ))}
        </div>
        {(fixedInc > 0 || varAvg > 0) && (
          <div className="mt-4 rounded-2xl bg-ink/[.03] p-3 text-sm space-y-1">
            <p>الشهر الضعيف تدّخر <b>{money(planMin, cur)}</b> · الشهر المتوسط <b>{money(planAvg, cur)}</b></p>
            <p className={cn("text-xs", planned > planMin ? "text-amber-700" : "text-muted")}>مجموع أقساط أهدافك الشهرية {money(planned, cur)}{planned > planMin ? " — أعلى من الشهر الضعيف، الأولوية للهدف الأول" : ""}</p>
          </div>
        )}
      </section>

      <div className="space-y-3">
        {goals.map((g, idx) => {
          const pct = (n(g.saved) / n(g.target)) * 100, left = Math.max(0, n(g.target) - n(g.saved));
          const months = n(g.monthly) ? Math.ceil(left / n(g.monthly)) : null;
          const eta = months ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" }).format(new Date(new Date().getFullYear(), new Date().getMonth() + months, 1)) : null;
          const ml = g.deadline ? Math.max(1, (parseYmd(g.deadline).getFullYear() - new Date().getFullYear()) * 12 + parseYmd(g.deadline).getMonth() - new Date().getMonth()) : null;
          return (
            <div key={g.id} className={cn("card p-4", pct >= 100 && "opacity-70")}>
              <div className="flex items-start gap-3">
                <span className="h-12 w-12 shrink-0 rounded-2xl bg-gold/15 flex items-center justify-center text-2xl">{g.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-gold bg-gold/10 rounded-md px-1.5 py-0.5">{idx + 1}</span><p className="font-semibold truncate">{g.name}</p></div>
                  <p className="text-sm mt-0.5"><b>{money(n(g.saved), cur)}</b> <span className="text-muted">من {money(n(g.target), cur)}</span></p>
                </div>
                {canEdit && <button onClick={() => setEdit(g)} className="icon-btn h-8 w-8"><Pencil size={13} /></button>}
              </div>
              <Progress value={pct} className="mt-3 h-2.5" color={pct >= 100 ? "#16a34a" : "rgb(var(--gold))"} />
              <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted mt-2">
                <span>{Math.round(pct)}%{left ? ` · باقي ${money(left, cur)}` : ""}</span>
                {pct >= 100 ? <span className="text-green-600 font-semibold">🎉 تحقق</span> : <span>{n(g.monthly) ? `${money(n(g.monthly), cur)} شهريًا · يتحقق ${eta}` : ml ? `تحتاج ${money(Math.ceil(left / ml), cur)} شهريًا` : ""}</span>}
              </div>
              {g.note && <p className="text-xs text-muted mt-3 pt-3 border-t border-line leading-5">💡 {g.note}</p>}
              {canEdit && pct < 100 && <button className="btn-outline w-full mt-3 h-9" onClick={() => setFund(g)}><Plus size={14} /> أضف للهدف</button>}
            </div>
          );
        })}
        {canEdit && <button onClick={() => setEdit("new")} className="w-full rounded-2xl border-2 border-dashed border-line p-5 flex items-center justify-center gap-2 text-muted hover:text-brand hover:border-brand/40 transition"><Plus size={20} /> هدف ادخار جديد</button>}
      </div>

      <GoalModal value={edit} onClose={() => setEdit(null)} wsId={wsId} count={goals.length} onSaved={() => { setEdit(null); reload(); }} />
      <FundModal goal={fund} onClose={() => setFund(null)} {...{ wsId, wallets, accounts, cur, defAcc }} onSaved={() => { setFund(null); reload(); }} />
    </div>
  );
}

function GoalModal({ value, onClose, wsId, count, onSaved }: { value: Goal | "new" | null; onClose: () => void; wsId: string; count: number; onSaved: () => void }) {
  const edit = value && value !== "new" ? value : null;
  const [k, setK] = useState<string | null>(null);
  const blank = { name: "", icon: "🎯", target: "", saved: "", monthly: "", deadline: "", priority: String(count + 1), note: "" };
  const [f, setF] = useState(blank);
  const key = value === "new" ? "new" : edit?.id ?? null;
  if (key !== k) { setK(key); setF(edit ? { name: edit.name, icon: edit.icon, target: String(n(edit.target)), saved: String(n(edit.saved)), monthly: edit.monthly ? String(n(edit.monthly)) : "", deadline: edit.deadline ?? "", priority: String(edit.priority ?? 0), note: edit.note ?? "" } : blank); }
  if (!value) return null;
  const save = async () => {
    if (!f.name.trim() || !Number(f.target)) return;
    const row = { name: f.name.trim(), icon: f.icon, target: Number(f.target), saved: Number(f.saved || 0), monthly: f.monthly ? Number(f.monthly) : null, deadline: f.deadline || null, priority: Number(f.priority || 0), note: f.note || null };
    if (edit) await supabase().from("savings_goals").update(row).eq("id", edit.id);
    else await supabase().from("savings_goals").insert({ ...row, workspace_id: wsId });
    onSaved();
  };
  const del = async () => { if (!edit || !confirm("حذف الهدف؟")) return; await supabase().from("savings_goals").delete().eq("id", edit.id); onSaved(); };
  return (
    <Modal open onClose={onClose} title={edit ? "تعديل الهدف" : "هدف جديد"}>
      <div className="space-y-3">
        <div className="flex gap-2"><input className="input w-16 text-center text-lg" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} /><input className="input" autoFocus placeholder="مثال: صندوق الطوارئ، سيارة، عمرة" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">المبلغ المستهدف</label><input type="number" className="input" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></div>
          <div><label className="label">المجمّع حاليًا</label><input type="number" className="input" value={f.saved} onChange={(e) => setF({ ...f, saved: e.target.value })} /></div>
          <div><label className="label">القسط الشهري</label><input type="number" className="input" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} /></div>
          <div><label className="label">الأولوية</label><input type="number" min={1} className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} /></div>
        </div>
        <div><label className="label">الموعد (اختياري)</label><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
        <textarea className="input min-h-[70px] py-2" placeholder="ليش هذا الهدف؟ وش القاعدة؟" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <div className="flex gap-2"><button className="btn-primary flex-1" onClick={save}>حفظ</button>{edit && <button className="btn-outline text-red-600" onClick={del}><Trash2 size={15} /></button>}</div>
      </div>
    </Modal>
  );
}

function FundModal({ goal, onClose, wsId, wallets, accounts, cur, defAcc, onSaved }: { goal: Goal | null; onClose: () => void; wsId: string; wallets: Wallet[]; accounts: Account[]; cur: string; defAcc: string; onSaved: () => void }) {
  const savAccs = accounts.filter((a) => kindOf(a, wallets) === "savings");
  const [k, setK] = useState<string | null>(null);
  const [amt, setAmt] = useState(""); const [move, setMove] = useState(true); const [from, setFrom] = useState(""); const [out, setOut] = useState(false);
  if ((goal?.id ?? null) !== k) { setK(goal?.id ?? null); if (goal) { setAmt(goal.monthly ? String(n(goal.monthly)) : ""); setFrom(defAcc); setMove(savAccs.length > 0); setOut(false); } }
  if (!goal) return null;
  const go = async () => {
    const v = Number(amt); if (!v) return;
    const sb = supabase();
    await sb.from("savings_goals").update({ saved: Math.max(0, n(goal.saved) + (out ? -v : v)) }).eq("id", goal.id);
    if (move && savAccs[0] && from) await sb.from("transactions").insert(out
      ? { workspace_id: wsId, type: "transfer", amount: v, account_id: savAccs[0].id, to_account_id: from, note: `سحب من هدف ${goal.name}`, date: today() }
      : { workspace_id: wsId, type: "transfer", amount: v, account_id: from, to_account_id: savAccs[0].id, note: `ادخار: ${goal.name}`, date: today() });
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`${goal.icon} ${goal.name}`}>
      <div className="space-y-3">
        <Segmented value={out ? "o" : "i"} onChange={(v) => setOut(v === "o")} options={[{ value: "i", label: "إيداع" }, { value: "o", label: "سحب" }]} />
        <input type="number" inputMode="decimal" className="input text-lg" autoFocus placeholder="المبلغ" value={amt} onChange={(e) => setAmt(e.target.value)} />
        {savAccs.length > 0 && (
          <div className="rounded-2xl border border-line p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} className="accent-[rgb(var(--brand))]" /> {out ? `رجّعها من «${savAccs[0].name}» إلى` : `حوّلها فعليًا إلى «${savAccs[0].name}» من`}</label>
            {move && <AccountSelect accounts={accounts} wallets={wallets} value={from} onChange={setFrom} className="w-full" allowNone={false} kinds={["mine"]} />}
          </div>
        )}
        <button className="btn-primary w-full" disabled={!Number(amt)} onClick={go}>{out ? "سحب" : "إيداع"} {Number(amt) ? money(Number(amt), cur) : ""}</button>
      </div>
    </Modal>
  );
}

/* ---------------- الميزانية ---------------- */
const CAT_COLORS = ["#ea580c", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#0891b2", "#16a34a", "#b45309", "#64748b"];
function Budget({ cats, tx, cur, reload, wsId }: { cats: Category[]; tx: Transaction[]; cur: string; reload: () => void; wsId: string }) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState(""); const [icon, setIcon] = useState("📦"); const [type, setType] = useState<"expense" | "income">("expense"); const [debt, setDebt] = useState(false);
  const exp = cats.filter((c) => c.type === "expense" && c.kind !== "debt");
  const spent = (id: string) => tx.filter((t) => t.category_id === id && t.type === "expense" && t.nature !== "custody").reduce((s, t) => s + Number(t.amount), 0);
  const totalBudget = exp.reduce((s, c) => s + Number(c.monthly_budget ?? 0), 0);
  const totalSpent = exp.reduce((s, c) => s + spent(c.id), 0);

  const setBudget = async (c: Category, v: string) => {
    await supabase().from("fin_categories").update({ monthly_budget: v ? Number(v) : null }).eq("id", c.id); reload();
  };
  const add = async () => {
    if (!name.trim()) return;
    await supabase().from("fin_categories").insert({ workspace_id: wsId, name: name.trim(), icon, type, kind: type === "expense" && debt ? "debt" : "normal", color: CAT_COLORS[cats.length % CAT_COLORS.length] });
    setName(""); setModal(false); reload();
  };

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-end justify-between mb-2">
          <div><p className="text-xs text-muted">إجمالي الميزانية</p><p className="text-2xl font-bold">{money(totalSpent, cur)} <span className="text-sm text-muted font-normal">من {money(totalBudget, cur)}</span></p></div>
          <p className={cn("text-sm font-semibold", totalSpent > totalBudget && totalBudget > 0 ? "text-red-600" : "text-brand")}>{totalBudget ? `متبقي ${money(Math.max(0, totalBudget - totalSpent), cur)}` : "حدد ميزانية لكل تصنيف"}</p>
        </div>
        <Progress value={totalBudget ? (totalSpent / totalBudget) * 100 : 0} color={totalSpent > totalBudget ? "#ef4444" : undefined} className="h-3" />
      </section>

      <section className="card p-2">
        {exp.map((c) => {
          const s = spent(c.id), b = Number(c.monthly_budget ?? 0), pct = b ? (s / b) * 100 : 0;
          return (
            <div key={c.id} className="group flex items-center gap-3 px-3 py-3 border-b border-line last:border-0">
              <span className="h-10 w-10 rounded-xl flex items-center justify-center text-lg" style={{ background: c.color + "1a" }}>{c.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-sm mb-1.5"><span className="font-medium">{c.name}</span><span className={cn("text-xs", pct > 100 ? "text-red-600 font-semibold" : pct > 80 ? "text-amber-600" : "text-muted")}>{money(s, cur)}{b ? ` / ${money(b, cur)}` : ""}</span></div>
                <Progress value={pct} color={pct > 100 ? "#ef4444" : pct > 80 ? "#f59e0b" : c.color} />
              </div>
              <input type="number" defaultValue={c.monthly_budget ?? ""} placeholder="الحد" onBlur={(e) => e.target.value !== String(c.monthly_budget ?? "") && setBudget(c, e.target.value)} className="input h-9 w-24 text-center text-xs" />
              <button className="icon-btn opacity-0 group-hover:opacity-100" onClick={async () => { if (!confirm("حذف التصنيف؟")) return; await supabase().from("fin_categories").delete().eq("id", c.id); reload(); }}><Trash2 size={14} /></button>
            </div>
          );
        })}
        {cats.filter((c) => c.kind === "debt").map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-3 py-3 border-b border-line text-sm">
            <span className="h-10 w-10 rounded-xl flex items-center justify-center text-lg bg-ink/5">{c.icon}</span>
            <span className="flex-1">{c.name} <span className="text-[11px] text-muted">— سداد ديون، خارج ميزانية المعيشة</span></span>
            <span className="font-medium">{money(spent(c.id), cur)}</span>
          </div>
        ))}
        <button className="btn-ghost m-2 text-brand" onClick={() => setModal(true)}><Plus size={16} /> تصنيف جديد</button>
      </section>

      <Modal open={modal} onClose={() => setModal(false)} title="تصنيف جديد">
        <div className="space-y-3">
          <Segmented value={type} onChange={setType} options={[{ value: "expense", label: "مصروف" }, { value: "income", label: "دخل" }]} />
          <div className="flex gap-2"><input className="input w-16 text-center text-lg" value={icon} onChange={(e) => setIcon(e.target.value)} /><input className="input" autoFocus placeholder="اسم التصنيف" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /></div>
          {type === "expense" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={debt} onChange={(e) => setDebt(e.target.checked)} className="accent-[rgb(var(--brand))]" /> سداد ديون — ما ينحسب من مصروف المعيشة</label>}
          <button className="btn-primary w-full" onClick={add}>إضافة</button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- الالتزامات والديون ---------------- */
const KINDS = { bill: { l: "فاتورة شهرية", i: "🧾" }, installment: { l: "قسط", i: "🏦" }, debt_owed: { l: "دين علي", i: "🔻" }, debt_lent: { l: "دين لي", i: "🔺" } } as const;

function Obligations({ items, cur, reload, cats, wsId, defAcc }: { items: Obligation[]; cur: string; reload: () => void; cats: Category[]; wsId: string; defAcc?: string }) {
  const [modal, setModal] = useState(false);
  const [f, setF] = useState({ name: "", kind: "bill" as Obligation["kind"], amount: "", total: "", due_day: "", counterparty: "" });
  const [pay, setPay] = useState<Obligation | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [logTx, setLogTx] = useState(true);

  const day = new Date().getDate();
  const monthly = items.filter((o) => o.kind === "bill" || o.kind === "installment").reduce((s, o) => s + Number(o.amount), 0);
  const owed = items.filter((o) => o.kind === "debt_owed").reduce((s, o) => s + Number(o.total_amount ?? 0) - Number(o.paid_amount), 0);
  const lent = items.filter((o) => o.kind === "debt_lent").reduce((s, o) => s + Number(o.total_amount ?? 0) - Number(o.paid_amount), 0);
  const upcoming = items.filter((o) => o.due_day).map((o) => ({ o, inDays: (o.due_day! - day + 31) % 31 })).sort((a, b) => a.inDays - b.inDays);

  const add = async () => {
    if (!f.name.trim()) return;
    await supabase().from("obligations").insert({
      workspace_id: wsId, name: f.name.trim(), kind: f.kind, amount: Number(f.amount || 0), total_amount: f.total ? Number(f.total) : null,
      due_day: f.due_day ? Number(f.due_day) : null, counterparty: f.counterparty || null,
    });
    setF({ name: "", kind: "bill", amount: "", total: "", due_day: "", counterparty: "" }); setModal(false); reload();
  };

  const doPay = async () => {
    if (!pay) return; const n = Number(payAmount); if (!n) return;
    const sb = supabase();
    const paid = Number(pay.paid_amount) + n;
    const finished = pay.total_amount && paid >= Number(pay.total_amount);
    await sb.from("obligations").update({ paid_amount: paid, active: !finished }).eq("id", pay.id);
    if (logTx) {
      const isIncome = pay.kind === "debt_lent";
      const cat = (pay.kind === "debt_owed" ? cats.find((c) => c.kind === "debt") : null) ?? cats.find((c) => c.type === (isIncome ? "income" : "expense") && c.name.includes(isIncome ? "إضافي" : "فواتير")) ?? cats.find((c) => c.type === (isIncome ? "income" : "expense"));
      await sb.from("transactions").insert({ workspace_id: wsId, type: isIncome ? "income" : "expense", amount: n, category_id: cat?.id ?? null, note: `${KINDS[pay.kind].l}: ${pay.name}`, date: today(), account_id: defAcc || null });
    }
    setPay(null); reload();
  };

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card p-5"><p className="text-xs text-muted">التزامات شهرية</p><p className="text-xl font-bold">{money(monthly, cur)}</p></div>
        <div className="card p-5"><p className="text-xs text-muted">ديون علي (متبقي)</p><p className="text-xl font-bold text-red-600">{money(owed, cur)}</p></div>
        <div className="card p-5"><p className="text-xs text-muted">ديون لي (متبقي)</p><p className="text-xl font-bold text-green-600">{money(lent, cur)}</p></div>
      </div>

      {upcoming.length > 0 && (
        <section className="card p-5">
          <h3 className="font-semibold mb-3">⏰ الاستحقاقات القادمة</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcoming.slice(0, 6).map(({ o, inDays }) => (
              <div key={o.id} className={cn("shrink-0 rounded-2xl border p-3 w-44", inDays <= 3 ? "border-red-500/40 bg-red-500/5" : "border-line")}>
                <p className="text-sm font-medium truncate">{KINDS[o.kind].i} {o.name}</p>
                <p className="text-lg font-bold mt-1">{money(Number(o.amount), cur)}</p>
                <p className={cn("text-[11px]", inDays <= 3 ? "text-red-600" : "text-muted")}>{inDays === 0 ? "اليوم" : `بعد ${inDays} يوم`} · يوم {o.due_day}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card p-2">
        {items.length === 0 && <Empty icon="🧾" title="ما فيه التزامات" hint="أضف فواتيرك الشهرية، أقساطك، والديون" />}
        {items.map((o) => {
          const remaining = o.total_amount ? Number(o.total_amount) - Number(o.paid_amount) : null;
          return (
            <div key={o.id} className="group flex flex-wrap items-center gap-3 px-3 py-3 border-b border-line last:border-0">
              <span className="text-2xl">{KINDS[o.kind].i}</span>
              <div className="flex-1 min-w-[160px]">
                <p className="font-medium text-sm">{o.name} {o.counterparty && <span className="text-muted text-xs">· {o.counterparty}</span>}</p>
                <p className="text-[11px] text-muted">{KINDS[o.kind].l}{o.amount ? ` · ${money(Number(o.amount), cur)}` : ""}{o.due_day ? ` · يوم ${o.due_day}` : ""}</p>
                {o.total_amount && <Progress value={(Number(o.paid_amount) / Number(o.total_amount)) * 100} className="mt-2 max-w-xs" color={o.kind === "debt_lent" ? "#16a34a" : undefined} />}
              </div>
              {remaining !== null && <span className="text-xs text-muted">متبقي <b className="text-ink">{money(remaining, cur)}</b></span>}
              <button className="btn-outline h-8 text-xs" onClick={() => { setPay(o); setPayAmount(String(o.amount || remaining || "")); }}>{o.kind === "debt_lent" ? "استلمت" : "دفعت"}</button>
              <button className="icon-btn opacity-0 group-hover:opacity-100" onClick={async () => { if (!confirm("حذف؟")) return; await supabase().from("obligations").delete().eq("id", o.id); reload(); }}><Trash2 size={14} /></button>
            </div>
          );
        })}
        <button className="btn-ghost m-2 text-brand" onClick={() => setModal(true)}><Plus size={16} /> التزام جديد</button>
      </section>

      <Modal open={modal} onClose={() => setModal(false)} title="التزام جديد">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(KINDS) as Obligation["kind"][]).map((k) => (
              <button key={k} onClick={() => setF({ ...f, kind: k })} className={cn("rounded-xl border p-2.5 text-sm", f.kind === k ? "border-brand bg-brand/10 text-brand font-medium" : "border-line")}>{KINDS[k].i} {KINDS[k].l}</button>
            ))}
          </div>
          <input className="input" placeholder="الاسم (مثال: فاتورة الكهرباء، قسط السيارة)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          {(f.kind === "debt_owed" || f.kind === "debt_lent") && <input className="input" placeholder="الشخص / الجهة" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} />}
          <div className="grid grid-cols-3 gap-2">
            <div><label className="label">{f.kind === "bill" ? "المبلغ الشهري" : "القسط"}</label><input type="number" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><label className="label">الإجمالي</label><input type="number" className="input" disabled={f.kind === "bill"} value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></div>
            <div><label className="label">يوم الاستحقاق</label><input type="number" min={1} max={31} className="input" value={f.due_day} onChange={(e) => setF({ ...f, due_day: e.target.value })} /></div>
          </div>
          <button className="btn-primary w-full" onClick={add}>إضافة</button>
        </div>
      </Modal>

      <Modal open={!!pay} onClose={() => setPay(null)} title={pay ? `${pay.kind === "debt_lent" ? "استلام" : "سداد"}: ${pay.name}` : ""}>
        <div className="space-y-3">
          <input type="number" className="input" autoFocus value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={logTx} onChange={(e) => setLogTx(e.target.checked)} className="accent-[rgb(var(--brand))]" /> سجّلها كعملية في المصاريف/الدخل</label>
          <button className="btn-primary w-full" onClick={doPay}>تأكيد</button>
        </div>
      </Modal>
    </div>
  );
}

