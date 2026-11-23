"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Empty, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { cn, friendlyDate, money, today } from "@/lib/utils";
import type { Account, AccountType, Category, Transaction, Wallet } from "@/lib/types";

export const ACC: Record<AccountType, { l: string; i: string }> = {
  ewallet: { l: "محفظة جوال", i: "📱" }, cash: { l: "نقد", i: "💵" }, bank: { l: "بنكي", i: "🏦" }, card: { l: "بطاقة", i: "💳" }, savings: { l: "ادخار", i: "🐷" },
};
const KIND = { mine: { l: "فلوسي", i: "👛" }, savings: { l: "الادخار", i: "🐷" }, custody: { l: "أمانة", i: "🤝" } } as const;

export const kindOf = (a: Account | undefined, wallets: Wallet[]) => wallets.find((w) => w.id === a?.wallet_id)?.kind ?? "mine";
export const accLabel = (a: Account | undefined, wallets: Wallet[]) => {
  if (!a) return "";
  const w = wallets.find((x) => x.id === a.wallet_id);
  return w?.kind === "custody" ? `🤝 ${w.name}` : `${ACC[a.type]?.i ?? "💳"} ${a.name}`;
};
const sum = (xs: Account[]) => xs.reduce((s, a) => s + Number(a.balance ?? 0), 0);

/** يجيب مجموعة من نوع معيّن أو يسويها (فلوسي / الادخار) */
async function ensureWallet(wsId: string, wallets: Wallet[], kind: "mine" | "savings") {
  const w = wallets.find((x) => x.kind === kind);
  if (w) return w.id;
  const { data } = await supabase().from("fin_wallets").insert({ workspace_id: wsId, kind, name: KIND[kind].l, icon: KIND[kind].i, position: kind === "mine" ? 0 : 1 }).select("id").single();
  return data?.id as string;
}

/** الحسابات: وين فلوسك فعليًا — فلوسي، الادخار، والأمانات اللي عندك لغيرك (ما تنحسب من فلوسك) */
export function Accounts({ wallets, accounts, tx, cats, cur, wsId, canEdit, reload }: {
  wallets: Wallet[]; accounts: Account[]; tx: Transaction[]; cats: Category[]; cur: string; wsId: string; canEdit: boolean; reload: () => void;
}) {
  const [accModal, setAccModal] = useState<{ acc?: Account; kind: "mine" | "savings" } | null>(null);
  const [custodyModal, setCustodyModal] = useState<Wallet | "new" | null>(null);
  const [move, setMove] = useState<{ w: Wallet; dir: "in" | "out" } | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const of = (k: Wallet["kind"]) => accounts.filter((a) => kindOf(a, wallets) === k);
  const mine = of("mine"), saving = of("savings");
  const custody = wallets.filter((w) => w.kind === "custody");
  const custodyTotal = sum(of("custody"));

  const Row = ({ a, kind }: { a: Account; kind: "mine" | "savings" }) => (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ink/[.03]">
      <span className="h-10 w-10 rounded-xl bg-ink/5 flex items-center justify-center text-lg">{ACC[a.type]?.i ?? "💳"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">{a.name} {a.is_default && <Star size={12} className="text-gold fill-gold" />}</p>
        <p className="text-[11px] text-muted">{ACC[a.type]?.l}{a.is_default ? " · الافتراضي للصرفيات" : ""}</p>
      </div>
      <span className={cn("font-bold", Number(a.balance) < 0 && "text-red-600")}>{money(Number(a.balance ?? 0), cur)}</span>
      {canEdit && <button onClick={() => setAccModal({ acc: a, kind })} className="icon-btn h-8 w-8 sm:opacity-0 group-hover:opacity-100"><Pencil size={13} /></button>}
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="card p-5 bg-gradient-to-l from-brand to-teal-700 text-white border-0">
        <p className="text-sm text-white/80">صافي فلوسك</p>
        <p className="text-3xl font-bold mt-1">{money(sum(mine) + sum(saving), cur)}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-white/90">
          <span>👛 للصرف {money(sum(mine), cur)}</span>
          <span>🐷 مدخر {money(sum(saving), cur)}</span>
          {custody.length > 0 && <span className="text-white/70">🤝 أمانات عندك {money(custodyTotal, cur)} — مو محسوبة</span>}
        </div>
        {canEdit && accounts.length > 1 && (
          <button onClick={() => setTransfer(true)} className="mt-4 h-9 px-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-sm inline-flex items-center gap-1.5"><ArrowLeftRight size={15} /> تحويل بين الحسابات</button>
        )}
      </section>

      <section className="card p-2">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h3 className="font-semibold">👛 فلوسي <span className="text-xs text-muted font-normal">— وين فلوسك فعليًا</span></h3>
          {canEdit && <button onClick={() => setAccModal({ kind: "mine" })} className="btn-ghost h-8 text-xs text-brand"><Plus size={14} /> حساب</button>}
        </div>
        {!mine.length && <Empty icon="📱" title="أضف حساباتك" hint="محفظة الجوال، النقد اللي معك، أو حساب بنكي" />}
        {mine.map((a) => <Row key={a.id} a={a} kind="mine" />)}
      </section>

      <section className="card p-2">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h3 className="font-semibold">🐷 الادخار <span className="text-xs text-muted font-normal">— فلوس مفصولة عن الصرف</span></h3>
          {canEdit && <button onClick={() => setAccModal({ kind: "savings" })} className="btn-ghost h-8 text-xs text-brand"><Plus size={14} /> حساب ادخار</button>}
        </div>
        {!saving.length && <p className="text-sm text-muted px-3 pb-3">افصل فلوس الادخار في حساب لحاله (مثل حساب ادخار في البنك الرقمي) عشان ما تنصرف بالغلط.</p>}
        {saving.map((a) => <Row key={a.id} a={a} kind="savings" />)}
      </section>

      <section className="card p-2">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h3 className="font-semibold">🤝 أمانات عندي <span className="text-xs text-muted font-normal">— فلوس غيرك، ما تنحسب من فلوسك</span></h3>
          {canEdit && <button onClick={() => setCustodyModal("new")} className="btn-ghost h-8 text-xs text-brand"><Plus size={14} /> أمانة</button>}
        </div>
        {!custody.length && <p className="text-sm text-muted px-3 pb-3">مثل فلوس الإيجار اللي يحطها أبوك عندك. تتابع رصيدها لحالها بدون ما تختلط بفلوسك.</p>}
        {custody.map((w) => {
          const accs = accounts.filter((a) => a.wallet_id === w.id);
          const ids = new Set(accs.map((a) => a.id));
          const hist = tx.filter((t) => ids.has(t.account_id ?? "") || ids.has(t.to_account_id ?? ""));
          return (
            <div key={w.id} className="rounded-2xl border border-line m-1.5 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <span className="h-10 w-10 rounded-xl flex items-center justify-center text-lg bg-gold/15">{w.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{w.name}</p>
                  <p className="text-[11px] text-muted">{w.owner_name ? `لـ ${w.owner_name}` : "أمانة"}{accs[0] ? ` · ${ACC[accs[0].type]?.l}` : ""}</p>
                </div>
                <span className="font-bold">{money(sum(accs), cur)}</span>
              </div>
              <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
                {canEdit && <button onClick={() => setMove({ w, dir: "in" })} className="btn-ghost h-8 text-xs text-green-700"><ArrowDownLeft size={14} /> استلمت</button>}
                {canEdit && <button onClick={() => setMove({ w, dir: "out" })} className="btn-ghost h-8 text-xs text-red-600"><ArrowUpRight size={14} /> صرفت/سلّمت</button>}
                <button onClick={() => setOpen(open === w.id ? null : w.id)} className="btn-ghost h-8 text-xs">السجل ({hist.length})</button>
                <span className="flex-1" />
                {canEdit && <button onClick={() => setCustodyModal(w)} className="icon-btn h-8 w-8"><Pencil size={13} /></button>}
              </div>
              {open === w.id && (
                <div className="border-t border-line max-h-64 overflow-y-auto p-1">
                  {!hist.length && <p className="text-xs text-muted text-center py-4">ما فيه حركات هالشهر</p>}
                  {hist.map((t) => <TxRow key={t.id} t={t} cats={cats} accounts={accounts} wallets={wallets} cur={cur} />)}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <AccountModal value={accModal} onClose={() => setAccModal(null)} wsId={wsId} wallets={wallets} onSaved={() => { setAccModal(null); reload(); }} />
      <CustodyModal value={custodyModal} onClose={() => setCustodyModal(null)} wsId={wsId} accounts={accounts} onSaved={() => { setCustodyModal(null); reload(); }} />
      <CustodyMove value={move} onClose={() => setMove(null)} wsId={wsId} accounts={accounts} cur={cur} onSaved={() => { setMove(null); reload(); }} />
      <TransferModal open={transfer} onClose={() => setTransfer(false)} accounts={accounts} wallets={wallets} wsId={wsId} cur={cur} onSaved={() => { setTransfer(false); reload(); }} />
    </div>
  );
}

export function TxRow({ t, cats, accounts, wallets, cur, focus, onDelete }: {
  t: Transaction; cats: Category[]; accounts: Account[]; wallets: Wallet[]; cur: string; focus?: Set<string>; onDelete?: () => void;
}) {
  const c = cats.find((x) => x.id === t.category_id);
  const from = accounts.find((a) => a.id === t.account_id);
  const to = accounts.find((a) => a.id === t.to_account_id);
  const isTransfer = t.type === "transfer";
  const custody = t.nature === "custody";
  const incoming = isTransfer && focus ? focus.has(t.to_account_id ?? "") && !focus.has(t.account_id ?? "") : false;
  const plus = t.type === "income" || incoming;
  const sign = plus ? "+" : isTransfer ? "↔" : "−";
  const icon = custody ? "🤝" : isTransfer ? "↔️" : c?.icon ?? "💳";
  const title = t.note || (custody ? (t.type === "income" ? "استلام أمانة" : "صرف من أمانة") : isTransfer ? "تحويل" : c?.name) || "—";
  const sub = isTransfer ? `${accLabel(from, wallets)} ← ${accLabel(to, wallets)}` : [custody ? "أمانة" : c?.name, from ? accLabel(from, wallets) : null].filter(Boolean).join(" · ");
  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ink/[.03]">
      <span className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: (isTransfer || custody ? "#64748b" : c?.color ?? "#94a3b8") + "1a" }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{title}</p>
        <p className="text-[11px] text-muted truncate">{sub} · {friendlyDate(t.date)}</p>
      </div>
      <span className={cn("font-semibold text-sm whitespace-nowrap", plus && !custody && "text-green-600", (custody || (isTransfer && !incoming)) && "text-muted")}>{sign}{money(Number(t.amount), cur)}</span>
      {onDelete && <button className="icon-btn h-7 w-7 sm:opacity-0 group-hover:opacity-100" onClick={onDelete}><Trash2 size={13} /></button>}
    </div>
  );
}

export function AccountSelect({ accounts, wallets, value, onChange, className, allowNone = true, kinds }: {
  accounts: Account[]; wallets: Wallet[]; value: string; onChange: (v: string) => void; className?: string; allowNone?: boolean; kinds?: Wallet["kind"][];
}) {
  const groups = (["mine", "savings", "custody"] as const).filter((k) => !kinds || kinds.includes(k));
  return (
    <select className={cn("input w-auto", className)} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">— بدون حساب —</option>}
      {groups.map((k) => {
        const list = accounts.filter((a) => kindOf(a, wallets) === k);
        if (!list.length) return null;
        return (
          <optgroup key={k} label={`${KIND[k].i} ${KIND[k].l}`}>
            {list.map((a) => <option key={a.id} value={a.id}>{k === "custody" ? `🤝 ${wallets.find((w) => w.id === a.wallet_id)?.name}` : `${ACC[a.type]?.i ?? ""} ${a.name}`}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

function AccountModal({ value, onClose, wsId, wallets, onSaved }: {
  value: { acc?: Account; kind: "mine" | "savings" } | null; onClose: () => void; wsId: string; wallets: Wallet[]; onSaved: () => void;
}) {
  const acc = value?.acc;
  const [k, setK] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", type: "ewallet" as AccountType, opening: "", def: false });
  const key = value ? acc?.id ?? "new:" + value.kind : null;
  if (key !== k) {
    setK(key);
    setF({ name: acc?.name ?? "", type: acc?.type ?? (value?.kind === "savings" ? "savings" : "ewallet"), opening: acc ? String(acc.opening_balance) : "", def: acc?.is_default ?? false });
  }
  if (!value) return null;
  const save = async () => {
    const sb = supabase();
    const row = { name: f.name.trim() || ACC[f.type].l, type: f.type, opening_balance: Number(f.opening || 0), is_default: value.kind === "mine" && f.def };
    if (acc) await sb.from("fin_accounts").update(row).eq("id", acc.id);
    else {
      const wallet_id = await ensureWallet(wsId, wallets, value.kind);
      await sb.from("fin_accounts").insert({ ...row, workspace_id: wsId, wallet_id, position: Date.now() });
    }
    onSaved();
  };
  const del = async () => {
    if (!acc || !confirm(`حذف «${acc.name}»؟ العمليات المسجلة عليه تبقى بدون حساب.`)) return;
    await supabase().from("fin_accounts").delete().eq("id", acc.id); onSaved();
  };
  const types: AccountType[] = value.kind === "savings" ? ["savings", "bank", "ewallet"] : ["ewallet", "cash", "bank", "card"];
  return (
    <Modal open onClose={onClose} title={`${acc ? "تعديل" : "إضافة"} ${value.kind === "savings" ? "حساب ادخار" : "حساب"}`}>
      <div className="space-y-3">
        <div className={cn("grid gap-1.5", types.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {types.map((t) => (
            <button key={t} onClick={() => setF({ ...f, type: t })} className={cn("rounded-xl border py-2 text-xs", f.type === t ? "border-brand bg-brand/10 text-brand font-medium" : "border-line")}>{ACC[t].i}<br />{ACC[t].l}</button>
          ))}
        </div>
        <input className="input" placeholder="الاسم، مثال: STC Bank، الكاش اللي معي" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div><label className="label">{acc ? "الرصيد الافتتاحي" : "رصيده الحين"}</label><input type="number" inputMode="decimal" className="input" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} /></div>
        {value.kind === "mine" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.def} onChange={(e) => setF({ ...f, def: e.target.checked })} className="accent-[rgb(var(--brand))]" /> الافتراضي للصرفيات واختصار الآيفون</label>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={save}>حفظ</button>
          {acc && <button className="btn-outline text-red-600" onClick={del}><Trash2 size={15} /></button>}
        </div>
      </div>
    </Modal>
  );
}

function CustodyModal({ value, onClose, wsId, accounts, onSaved }: { value: Wallet | "new" | null; onClose: () => void; wsId: string; accounts: Account[]; onSaved: () => void }) {
  const edit = value && value !== "new" ? value : null;
  const [k, setK] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", owner: "", amount: "", type: "cash" as AccountType });
  const key = value === "new" ? "new" : edit?.id ?? null;
  if (key !== k) { setK(key); setF({ name: edit?.name ?? "", owner: edit?.owner_name ?? "", amount: "", type: accounts.find((a) => a.wallet_id === edit?.id)?.type ?? "cash" }); }
  if (!value) return null;
  const save = async () => {
    if (!f.name.trim()) return;
    const sb = supabase();
    if (edit) {
      await sb.from("fin_wallets").update({ name: f.name.trim(), owner_name: f.owner || null }).eq("id", edit.id);
      await sb.from("fin_accounts").update({ type: f.type }).eq("wallet_id", edit.id);
    } else {
      const { data: w } = await sb.from("fin_wallets").insert({ workspace_id: wsId, kind: "custody", name: f.name.trim(), owner_name: f.owner || null, icon: "🤝", position: 9 }).select("id").single();
      if (w) await sb.from("fin_accounts").insert({ workspace_id: wsId, wallet_id: w.id, name: ACC[f.type].l, type: f.type, opening_balance: Number(f.amount || 0) });
    }
    onSaved();
  };
  const del = async () => {
    if (!edit || !confirm(`حذف أمانة «${edit.name}»؟`)) return;
    await supabase().from("fin_wallets").delete().eq("id", edit.id); onSaved();
  };
  return (
    <Modal open onClose={onClose} title={edit ? "تعديل الأمانة" : "أمانة جديدة"}>
      <div className="space-y-3">
        <input className="input" autoFocus placeholder="وش هي؟ مثال: إيجار البيت" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="لمين؟ مثال: أبوي" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
        <div className="grid grid-cols-3 gap-1.5">
          {(["cash", "ewallet", "bank"] as AccountType[]).map((t) => (
            <button key={t} onClick={() => setF({ ...f, type: t })} className={cn("rounded-xl border py-2 text-xs", f.type === t ? "border-brand bg-brand/10 text-brand font-medium" : "border-line")}>{ACC[t].i} {ACC[t].l}</button>
          ))}
        </div>
        {!edit && <div><label className="label">المبلغ اللي عندك منها الحين</label><input type="number" inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={save}>حفظ</button>
          {edit && <button className="btn-outline text-red-600" onClick={del}><Trash2 size={15} /></button>}
        </div>
      </div>
    </Modal>
  );
}

const MOVES = { in: ["أبوي حط فلوس", "أبوي رجّع اللي أخذه"], out: ["دفعت الإيجار", "أبوي أخذ منها"] };
function CustodyMove({ value, onClose, wsId, accounts, cur, onSaved }: { value: { w: Wallet; dir: "in" | "out" } | null; onClose: () => void; wsId: string; accounts: Account[]; cur: string; onSaved: () => void }) {
  const [amt, setAmt] = useState(""); const [note, setNote] = useState(""); const [date, setDate] = useState(today());
  if (!value) return null;
  const acc = accounts.find((a) => a.wallet_id === value.w.id);
  const save = async () => {
    const n = Number(amt); if (!n || !acc) return;
    await supabase().from("transactions").insert({ workspace_id: wsId, type: value.dir === "in" ? "income" : "expense", nature: "custody", amount: n, account_id: acc.id, note: note || null, date });
    setAmt(""); setNote(""); onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`${value.dir === "in" ? "استلام" : "صرف"} · ${value.w.name}`}>
      <div className="space-y-3">
        <p className="text-xs text-muted">الرصيد الحالي: {money(Number(acc?.balance ?? 0), cur)} — هذي الحركة ما تدخل في دخلك ولا مصروفك</p>
        <input type="number" inputMode="decimal" className="input text-lg" autoFocus placeholder="المبلغ" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {MOVES[value.dir].map((m) => <button key={m} onClick={() => setNote(m)} className={cn("chip h-8 px-3 border text-xs", note === m ? "bg-ink text-bg border-transparent" : "border-line")}>{m}</button>)}
        </div>
        <input className="input" placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn-primary w-full" onClick={save} disabled={!Number(amt)}>حفظ</button>
      </div>
    </Modal>
  );
}

function TransferModal({ open, onClose, accounts, wallets, wsId, cur, onSaved }: {
  open: boolean; onClose: () => void; accounts: Account[]; wallets: Wallet[]; wsId: string; cur: string; onSaved: () => void;
}) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [amt, setAmt] = useState(""); const [note, setNote] = useState(""); const [date, setDate] = useState(today());
  const [k, setK] = useState(false);
  if (open !== k) {
    setK(open);
    if (open) {
      const mine = accounts.filter((a) => kindOf(a, wallets) === "mine");
      const f = mine.find((a) => a.is_default) ?? mine[0] ?? accounts[0];
      setFrom(f?.id ?? ""); setTo(accounts.find((a) => a.id !== f?.id && kindOf(a, wallets) !== "custody")?.id ?? "");
    }
  }
  const fromAcc = accounts.find((a) => a.id === from);
  const save = async () => {
    const n = Number(amt);
    if (!from || !to || from === to || !n) return;
    await supabase().from("transactions").insert({ workspace_id: wsId, type: "transfer", amount: n, account_id: from, to_account_id: to, note: note || null, date });
    setAmt(""); setNote(""); onSaved();
  };
  return (
    <Modal open={open} onClose={onClose} title="تحويل بين الحسابات">
      <div className="space-y-3">
        <div><label className="label">من</label><AccountSelect accounts={accounts} wallets={wallets} value={from} onChange={setFrom} className="w-full" allowNone={false} /></div>
        {fromAcc && <p className="text-xs text-muted -mt-2">الرصيد: {money(Number(fromAcc.balance ?? 0), cur)}</p>}
        <div><label className="label">إلى</label><AccountSelect accounts={accounts} wallets={wallets} value={to} onChange={setTo} className="w-full" allowNone={false} /></div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" inputMode="decimal" className="input" placeholder="المبلغ" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <input className="input" placeholder="ملاحظة، مثال: سحب كاش، تحويل للادخار" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary w-full" disabled={!from || !to || from === to || !Number(amt)} onClick={save}><ArrowLeftRight size={15} /> تحويل</button>
      </div>
    </Modal>
  );
}
