"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, TrendingDown, TrendingUp, Scale } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis } from "recharts";
import { useApp } from "@/components/AppProvider";
import { Empty, Modal, PageHeader, Progress, Segmented } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { cn, friendlyDate, money, parseYmd, today, ymd } from "@/lib/utils";
import type { Account, Category, Goal, Obligation, Transaction, Wallet } from "@/lib/types";
import { AccountSelect, TxRow, Wallets } from "@/components/Wallets";

type Tab = "wallets" | "overview" | "budget" | "obligations" | "goals";

export default function FinancePage() {
  const { profile, ws, canEdit } = useApp();
  const cur = profile?.currency ?? "ر.س";
  const wsId = ws?.id ?? "";
  const [tab, setTab] = useState<Tab>("wallets");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [cats, setCats] = useState<Category[]>([]);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [obl, setObl] = useState<Obligation[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const from = ymd(month), to = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const loadTx = () => wsId && supabase().from("transactions").select("*").eq("workspace_id", wsId).gte("date", from).lte("date", to).order("date", { ascending: false }).order("created_at", { ascending: false }).then(({ data }) => setTx(data ?? []));
  const loadCats = () => wsId && supabase().from("fin_categories").select("*").eq("workspace_id", wsId).order("created_at").then(({ data }) => setCats(data ?? []));
  const loadObl = () => wsId && supabase().from("obligations").select("*").eq("workspace_id", wsId).eq("active", true).order("created_at").then(({ data }) => setObl(data ?? []));
  const loadGoals = () => wsId && supabase().from("savings_goals").select("*").eq("workspace_id", wsId).order("created_at").then(({ data }) => setGoals(data ?? []));
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
  useEffect(() => { loadCats(); loadObl(); loadGoals(); loadWallets(); }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadTx(); }, [from, wsId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const on = () => reloadMoney(); window.addEventListener("nz:refresh", on); return () => window.removeEventListener("nz:refresh", on); }); // eslint-disable-line react-hooks/exhaustive-deps

  const income = tx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = tx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const monthLabel = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" }).format(month);

  return (
    <div>
      <PageHeader title="المالية" subtitle={ws ? `${ws.icon} مالية «${ws.name}» — منفصلة عن باقي المساحات${ws.is_personal ? " وخاصة فيك" : ""}` : ""} actions={
        <Segmented value={tab} onChange={setTab} options={[{ value: "wallets", label: "المحافظ" }, { value: "overview", label: "العمليات" }, { value: "budget", label: "الميزانية" }, { value: "obligations", label: "الالتزامات" }, { value: "goals", label: "الادخار" }]} />
      } />

      {(tab === "overview" || tab === "budget" || tab === "wallets") && (
        <div className="flex items-center gap-2 mb-5">
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronRight size={18} /></button>
          <span className="font-semibold min-w-[120px] text-center">{monthLabel}</span>
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronLeft size={18} /></button>
        </div>
      )}

      {!canEdit && <p className="card px-4 py-3 mb-5 text-sm text-muted">👀 صلاحيتك في هذي المساحة مشاهدة فقط</p>}
      {tab === "wallets" && <Wallets wallets={wallets} accounts={accounts} tx={tx} cats={cats} cur={cur} wsId={wsId} canEdit={canEdit} reload={reloadMoney} />}
      {tab === "overview" && <Overview cats={cats} tx={tx} cur={cur} reload={reloadMoney} month={month} wsId={wsId} wallets={wallets} accounts={accounts} />}
      {tab === "budget" && <Budget cats={cats} tx={tx} cur={cur} reload={loadCats} wsId={wsId} />}
      {tab === "obligations" && <Obligations items={obl} cur={cur} reload={loadObl} cats={cats} wsId={wsId} />}
      {tab === "goals" && <Goals items={goals} cur={cur} reload={loadGoals} wsId={wsId} />}
    </div>
  );
}

/* ---------------- نظرة عامة + إضافة عملية ---------------- */
function Overview({ cats, tx: allTx, cur, reload, month, wsId, wallets, accounts }: { cats: Category[]; tx: Transaction[]; cur: string; reload: () => void; month: Date; wsId: string; wallets: Wallet[]; accounts: Account[] }) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [wf, setWf] = useState("all");
  const [acc, setAcc] = useState("");
  // الحساب الافتراضي أو آخر حساب استخدمته
  useEffect(() => {
    if (acc || !accounts.length) return;
    const last = typeof window !== "undefined" ? localStorage.getItem(`nz:acc:${wsId}`) : null;
    setAcc(accounts.find((a) => a.id === last)?.id ?? accounts.find((a) => a.is_default)?.id ?? "");
  }, [accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const wAccs = new Set(accounts.filter((a) => a.wallet_id === wf).map((a) => a.id));
  const tx = wf === "all" ? allTx : allTx.filter((t) => wAccs.has(t.account_id ?? "") || wAccs.has(t.to_account_id ?? ""));
  const income = tx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = tx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const typeCats = cats.filter((c) => c.type === type);

  useEffect(() => { setCat(typeCats[0]?.id ?? ""); }, [type, cats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    const n = Number(amount); if (!n || n <= 0) return;
    await supabase().from("transactions").insert({ workspace_id: wsId, type, amount: n, category_id: cat || null, note: note || null, date, account_id: acc || null });
    if (acc) localStorage.setItem(`nz:acc:${wsId}`, acc);
    setAmount(""); setNote(""); reload();
  };

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    tx.filter((t) => t.type === "expense").forEach((t) => m.set(t.category_id ?? "x", (m.get(t.category_id ?? "x") ?? 0) + Number(t.amount)));
    return [...m.entries()].map(([id, v]) => { const c = cats.find((x) => x.id === id); return { name: c ? `${c.icon} ${c.name}` : "بدون تصنيف", value: v, color: c?.color ?? "#94a3b8" }; }).sort((a, b) => b.value - a.value);
  }, [tx, cats]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const daily = Array.from({ length: daysInMonth }, (_, i) => {
    const d = ymd(new Date(month.getFullYear(), month.getMonth(), i + 1));
    return { day: i + 1, v: tx.filter((t) => t.type === "expense" && t.date === d).reduce((s, t) => s + Number(t.amount), 0) };
  });

  return (
    <div className="space-y-6">
      {wallets.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
          <button onClick={() => setWf("all")} className={cn("chip h-8 px-3 text-xs border shrink-0", wf === "all" ? "bg-ink text-bg border-transparent" : "border-line text-muted")}>كل المحافظ</button>
          {wallets.map((w) => (
            <button key={w.id} onClick={() => setWf(w.id)} className={cn("chip h-8 px-3 text-xs border shrink-0", wf === w.id ? "text-white border-transparent" : "border-line text-muted")} style={wf === w.id ? { background: w.color } : {}}>{w.icon} {w.name}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { l: "الدخل", v: income, icon: TrendingUp, c: "text-green-600", bg: "bg-green-500/10" },
          { l: "المصروف", v: expense, icon: TrendingDown, c: "text-red-600", bg: "bg-red-500/10" },
          { l: "الصافي", v: income - expense, icon: Scale, c: income - expense >= 0 ? "text-brand" : "text-red-600", bg: "bg-brand/10" },
        ].map((s) => (
          <div key={s.l} className="card p-3 sm:p-5 flex items-center gap-4 min-w-0">
            <span className={cn("hidden sm:flex h-11 w-11 shrink-0 rounded-2xl items-center justify-center", s.bg, s.c)}><s.icon size={20} /></span>
            <div className="min-w-0"><p className="text-[11px] sm:text-xs text-muted">{s.l}</p><p className={cn("text-sm sm:text-xl font-bold truncate", s.c)}>{money(s.v, cur)}</p></div>
          </div>
        ))}
      </div>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={type} onChange={setType} options={[{ value: "expense", label: "مصروف" }, { value: "income", label: "دخل" }]} />
          <input type="number" inputMode="decimal" className="input flex-1 min-w-[110px] sm:flex-none sm:w-28" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
            {typeCats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          {accounts.length > 0 && <AccountSelect accounts={accounts} wallets={wallets} value={acc} onChange={setAcc} />}
          <input className="input flex-1 min-w-[140px]" placeholder="وش هو؟" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-primary" onClick={add}><Plus size={16} /> إضافة</button>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-6">
        <section className="card p-5">
          <h3 className="font-semibold mb-2">المصاريف حسب التصنيف</h3>
          {byCat.length === 0 ? <Empty icon="📊" title="ما فيه مصاريف هالشهر" /> : (
            <>
              <div className="h-52">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byCat} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                      {byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => money(Number(v), cur)} contentStyle={{ borderRadius: 12, border: "1px solid rgb(var(--line))", direction: "rtl" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {byCat.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-muted text-xs">{Math.round((c.value / expense) * 100)}%</span>
                    <span className="font-medium w-24 text-left">{money(c.value, cur)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h3 className="font-semibold mb-3">المصروف اليومي</h3>
            <div className="h-40" dir="ltr">
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
            <h3 className="font-semibold px-3 pt-3 pb-2">العمليات ({tx.length})</h3>
            <div className="max-h-[360px] overflow-y-auto">
              {tx.length === 0 && <Empty icon="🧾" title="ما فيه عمليات" />}
              {tx.map((t) => (
                <TxRow key={t.id} t={t} cats={cats} accounts={accounts} wallets={wallets} cur={cur} focus={wf === "all" ? undefined : wAccs}
                  onDelete={async () => { await supabase().from("transactions").delete().eq("id", t.id); reload(); }} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------- الميزانية ---------------- */
const CAT_COLORS = ["#ea580c", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#0891b2", "#16a34a", "#b45309", "#64748b"];
function Budget({ cats, tx, cur, reload, wsId }: { cats: Category[]; tx: Transaction[]; cur: string; reload: () => void; wsId: string }) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState(""); const [icon, setIcon] = useState("📦"); const [type, setType] = useState<"expense" | "income">("expense");
  const exp = cats.filter((c) => c.type === "expense");
  const spent = (id: string) => tx.filter((t) => t.category_id === id && t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const totalBudget = exp.reduce((s, c) => s + Number(c.monthly_budget ?? 0), 0);
  const totalSpent = exp.reduce((s, c) => s + spent(c.id), 0);

  const setBudget = async (c: Category, v: string) => {
    await supabase().from("fin_categories").update({ monthly_budget: v ? Number(v) : null }).eq("id", c.id); reload();
  };
  const add = async () => {
    if (!name.trim()) return;
    await supabase().from("fin_categories").insert({ workspace_id: wsId, name: name.trim(), icon, type, color: CAT_COLORS[cats.length % CAT_COLORS.length] });
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
        <button className="btn-ghost m-2 text-brand" onClick={() => setModal(true)}><Plus size={16} /> تصنيف جديد</button>
      </section>

      <Modal open={modal} onClose={() => setModal(false)} title="تصنيف جديد">
        <div className="space-y-3">
          <Segmented value={type} onChange={setType} options={[{ value: "expense", label: "مصروف" }, { value: "income", label: "دخل" }]} />
          <div className="flex gap-2"><input className="input w-16 text-center text-lg" value={icon} onChange={(e) => setIcon(e.target.value)} /><input className="input" autoFocus placeholder="اسم التصنيف" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /></div>
          <button className="btn-primary w-full" onClick={add}>إضافة</button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- الالتزامات والديون ---------------- */
const KINDS = { bill: { l: "فاتورة شهرية", i: "🧾" }, installment: { l: "قسط", i: "🏦" }, debt_owed: { l: "دين علي", i: "🔻" }, debt_lent: { l: "دين لي", i: "🔺" } } as const;

function Obligations({ items, cur, reload, cats, wsId }: { items: Obligation[]; cur: string; reload: () => void; cats: Category[]; wsId: string }) {
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
      const cat = cats.find((c) => c.type === (isIncome ? "income" : "expense") && c.name.includes(isIncome ? "إضافي" : "سكن")) ?? cats.find((c) => c.type === (isIncome ? "income" : "expense"));
      await sb.from("transactions").insert({ workspace_id: wsId, type: isIncome ? "income" : "expense", amount: n, category_id: cat?.id ?? null, note: `${KINDS[pay.kind].l}: ${pay.name}`, date: today() });
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

/* ---------------- أهداف الادخار ---------------- */
function Goals({ items, cur, reload, wsId }: { items: Goal[]; cur: string; reload: () => void; wsId: string }) {
  const [modal, setModal] = useState(false);
  const [f, setF] = useState({ name: "", icon: "🎯", target: "", deadline: "" });
  const [fund, setFund] = useState<Goal | null>(null);
  const [amt, setAmt] = useState("");

  const add = async () => {
    if (!f.name.trim() || !Number(f.target)) return;
    await supabase().from("savings_goals").insert({ workspace_id: wsId, name: f.name.trim(), icon: f.icon, target: Number(f.target), deadline: f.deadline || null });
    setF({ name: "", icon: "🎯", target: "", deadline: "" }); setModal(false); reload();
  };
  const addFund = async (sign: 1 | -1) => {
    if (!fund || !Number(amt)) return;
    await supabase().from("savings_goals").update({ saved: Math.max(0, Number(fund.saved) + sign * Number(amt)) }).eq("id", fund.id);
    setFund(null); setAmt(""); reload();
  };
  const monthsLeft = (d: string | null) => { if (!d) return null; const a = new Date(), b = parseYmd(d); return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()); };

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((g) => {
          const pct = (Number(g.saved) / Number(g.target)) * 100;
          const ml = monthsLeft(g.deadline);
          const perMonth = ml ? Math.max(0, (Number(g.target) - Number(g.saved)) / ml) : null;
          return (
            <div key={g.id} className="card p-5 group">
              <div className="flex items-start justify-between">
                <span className="text-3xl">{g.icon}</span>
                <button className="icon-btn opacity-0 group-hover:opacity-100" onClick={async () => { if (!confirm("حذف الهدف؟")) return; await supabase().from("savings_goals").delete().eq("id", g.id); reload(); }}><Trash2 size={14} /></button>
              </div>
              <p className="font-semibold mt-2">{g.name}</p>
              <p className="text-sm mt-1"><b>{money(Number(g.saved), cur)}</b> <span className="text-muted">من {money(Number(g.target), cur)}</span></p>
              <Progress value={pct} className="mt-3 h-2.5" color={pct >= 100 ? "#16a34a" : "rgb(var(--gold))"} />
              <div className="flex justify-between text-[11px] text-muted mt-2">
                <span>{Math.round(pct)}%</span>
                {perMonth !== null && pct < 100 && <span>تحتاج {money(Math.ceil(perMonth), cur)} شهريًا</span>}
                {pct >= 100 && <span className="text-green-600 font-semibold">🎉 تحقق</span>}
              </div>
              <button className="btn-outline w-full mt-4 h-9" onClick={() => setFund(g)}>تحديث المبلغ</button>
            </div>
          );
        })}
        <button onClick={() => setModal(true)} className="rounded-2xl border-2 border-dashed border-line p-5 min-h-[200px] flex flex-col items-center justify-center gap-2 text-muted hover:text-brand hover:border-brand/40 transition">
          <Plus size={24} /> هدف ادخار جديد
        </button>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="هدف جديد">
        <div className="space-y-3">
          <div className="flex gap-2"><input className="input w-16 text-center text-lg" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} /><input className="input" autoFocus placeholder="مثال: سيارة، عمرة، صندوق طوارئ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">المبلغ المستهدف</label><input type="number" className="input" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></div>
            <div><label className="label">الموعد (اختياري)</label><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
          </div>
          <button className="btn-primary w-full" onClick={add}>إضافة</button>
        </div>
      </Modal>

      <Modal open={!!fund} onClose={() => setFund(null)} title={fund ? `${fund.icon} ${fund.name}` : ""}>
        <div className="space-y-3">
          <input type="number" className="input" autoFocus placeholder="المبلغ" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <div className="flex gap-2"><button className="btn-primary flex-1" onClick={() => addFund(1)}>+ إيداع</button><button className="btn-outline flex-1" onClick={() => addFund(-1)}>− سحب</button></div>
        </div>
      </Modal>
    </div>
  );
}
