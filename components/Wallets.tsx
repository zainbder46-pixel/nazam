"use client";

import { useState } from "react";
import { ArrowLeftRight, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Empty, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { cn, friendlyDate, money, today } from "@/lib/utils";
import type { Account, AccountType, Category, Transaction, Wallet } from "@/lib/types";

export const ACC: Record<AccountType, { l: string; i: string }> = {
  bank: { l: "بنكي", i: "🏦" }, cash: { l: "نقد", i: "💵" }, card: { l: "بطاقة", i: "💳" }, savings: { l: "ادخار", i: "🐷" },
};
const COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#b45309", "#16a34a", "#475569"];
const PRESETS = [
  { name: "فلوس أبوي", icon: "👨", note: "فلوس حاطها أبوي عندي" },
  { name: "الراتب", icon: "💼", note: "راتب الشغل" },
  { name: "مصروفي", icon: "💸", note: "مصروف شهري" },
  { name: "فري لانس", icon: "🧑‍💻", note: "دخل المشاريع الحرة" },
];

export const accLabel = (a: Account | undefined, wallets: Wallet[]) => {
  if (!a) return "";
  const w = wallets.find((x) => x.id === a.wallet_id);
  return `${w?.icon ?? ""} ${w?.name ?? ""} · ${ACC[a.type].i} ${a.name}`;
};

/** المحافظ: كل محفظة (أبوي، الراتب...) فيها حسابات بنكي/نقد لكل واحد رصيده */
export function Wallets({ wallets, accounts, tx, cats, cur, wsId, canEdit, reload }: {
  wallets: Wallet[]; accounts: Account[]; tx: Transaction[]; cats: Category[]; cur: string; wsId: string; canEdit: boolean; reload: () => void;
}) {
  const [walletModal, setWalletModal] = useState<Wallet | "new" | null>(null);
  const [accModal, setAccModal] = useState<{ wallet: Wallet; acc?: Account } | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [receive, setReceive] = useState<Wallet | null>(null);
  const [openW, setOpenW] = useState<string | null>(null);

  const accOf = (w: Wallet) => accounts.filter((a) => a.wallet_id === w.id);
  const total = accounts.reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const byType = (t: AccountType[]) => accounts.filter((a) => t.includes(a.type)).reduce((s, a) => s + Number(a.balance ?? 0), 0);

  const quickCreate = async (p: typeof PRESETS[number]) => {
    const sb = supabase();
    const { data: w } = await sb.from("fin_wallets").insert({ workspace_id: wsId, name: p.name, icon: p.icon, note: p.note, color: COLORS[wallets.length % COLORS.length], position: wallets.length }).select().single();
    if (w) await sb.from("fin_accounts").insert([
      { workspace_id: wsId, wallet_id: w.id, name: "الحساب البنكي", type: "bank", is_default: !accounts.length, position: 0 },
      { workspace_id: wsId, wallet_id: w.id, name: "نقد", type: "cash", position: 1 },
    ]);
    reload();
  };

  const removeWallet = async (w: Wallet) => {
    if (!confirm(`حذف محفظة «${w.name}»؟\nحساباتها بتنحذف، والعمليات المسجلة تبقى بدون حساب.`)) return;
    await supabase().from("fin_wallets").delete().eq("id", w.id); reload();
  };

  if (!wallets.length) {
    return (
      <div className="card p-6">
        <Empty icon="👛" title="رتّب فلوسك في محافظ" hint="كل مصدر فلوس له محفظة، وداخلها حساب بنكي ونقد لكل واحد رصيده" />
        {canEdit && (
          <>
            <p className="text-sm font-medium text-center mb-3">ابدأ بضغطة:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl mx-auto">
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => quickCreate(p)} className="rounded-2xl border border-line p-4 hover:border-brand/50 hover:bg-brand/5 transition">
                  <span className="text-3xl block">{p.icon}</span><span className="text-sm font-medium mt-1 block">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="text-center mt-4"><button className="btn-ghost text-brand" onClick={() => setWalletModal("new")}><Plus size={15} /> محفظة باسم ثاني</button></div>
          </>
        )}
        <WalletModal value={walletModal} onClose={() => setWalletModal(null)} wsId={wsId} count={wallets.length} hasAccounts={!!accounts.length} onSaved={() => { setWalletModal(null); reload(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-5 bg-gradient-to-l from-brand to-teal-700 text-white border-0">
        <p className="text-sm text-white/80">إجمالي فلوسك</p>
        <p className="text-3xl font-bold mt-1">{money(total, cur)}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-white/90">
          <span>🏦 بالبنك {money(byType(["bank", "card"]), cur)}</span>
          <span>💵 نقد {money(byType(["cash"]), cur)}</span>
          {byType(["savings"]) !== 0 && <span>🐷 ادخار {money(byType(["savings"]), cur)}</span>}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={() => setTransfer(true)} className="h-9 px-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-sm flex items-center gap-1.5"><ArrowLeftRight size={15} /> تحويل</button>
            <button onClick={() => setWalletModal("new")} className="h-9 px-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-sm flex items-center gap-1.5"><Plus size={15} /> محفظة</button>
          </div>
        )}
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        {wallets.map((w) => {
          const accs = accOf(w);
          const wt = accs.reduce((s, a) => s + Number(a.balance ?? 0), 0);
          const ids = new Set(accs.map((a) => a.id));
          const wtx = tx.filter((t) => ids.has(t.account_id ?? "") || ids.has(t.to_account_id ?? ""));
          const mIn = wtx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
          const mOut = wtx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
          return (
            <section key={w.id} className="card p-0 overflow-hidden group">
              <div className="p-4 flex items-start gap-3" style={{ background: w.color + "10" }}>
                <span className="h-11 w-11 rounded-2xl flex items-center justify-center text-2xl" style={{ background: w.color + "22" }}>{w.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{w.name}</p>
                  {w.note && <p className="text-[11px] text-muted truncate">{w.note}</p>}
                </div>
                <div className="text-left">
                  <p className={cn("font-bold", wt < 0 && "text-red-600")}>{money(wt, cur)}</p>
                  <p className="text-[10px] text-muted">هالشهر +{money(mIn, cur)} / −{money(mOut, cur)}</p>
                </div>
              </div>
              <div className="px-2 py-1">
                {accs.map((a) => (
                  <div key={a.id} className="group/a flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-ink/[.03]">
                    <span className="text-lg">{ACC[a.type].i}</span>
                    <span className="flex-1 min-w-0 text-sm truncate">{a.name} <span className="text-[11px] text-muted">· {ACC[a.type].l}</span></span>
                    {a.is_default && <Star size={12} className="text-gold fill-gold" />}
                    <span className={cn("text-sm font-semibold", Number(a.balance) < 0 && "text-red-600")}>{money(Number(a.balance ?? 0), cur)}</span>
                    {canEdit && <button onClick={() => setAccModal({ wallet: w, acc: a })} className="icon-btn h-7 w-7 opacity-0 group-hover/a:opacity-100"><Pencil size={12} /></button>}
                  </div>
                ))}
              </div>
              {w.monthly_amount ? (
                <div className="mx-4 mb-3 rounded-xl bg-gold/10 px-3 py-2 flex items-center gap-2 text-sm">
                  <span className="flex-1">💰 دخل شهري {money(Number(w.monthly_amount), cur)}{w.monthly_day ? ` · يوم ${w.monthly_day}` : ""}</span>
                  {canEdit && <button onClick={() => setReceive(w)} className="btn-outline h-7 text-xs">استلمته</button>}
                </div>
              ) : null}
              <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
                {canEdit && <button onClick={() => setAccModal({ wallet: w })} className="btn-ghost h-8 text-xs text-brand"><Plus size={13} /> حساب</button>}
                <button onClick={() => setOpenW(openW === w.id ? null : w.id)} className="btn-ghost h-8 text-xs">العمليات ({wtx.length})</button>
                <span className="flex-1" />
                {canEdit && <button onClick={() => setWalletModal(w)} className="icon-btn h-8 w-8"><Pencil size={13} /></button>}
                {canEdit && <button onClick={() => removeWallet(w)} className="icon-btn h-8 w-8 hover:text-red-600"><Trash2 size={13} /></button>}
              </div>
              {openW === w.id && (
                <div className="border-t border-line max-h-72 overflow-y-auto p-1">
                  {!wtx.length && <p className="text-xs text-muted text-center py-4">ما فيه عمليات هالشهر</p>}
                  {wtx.map((t) => <TxRow key={t.id} t={t} cats={cats} accounts={accounts} wallets={wallets} cur={cur} focus={ids} />)}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <WalletModal value={walletModal} onClose={() => setWalletModal(null)} wsId={wsId} count={wallets.length} hasAccounts={!!accounts.length} onSaved={() => { setWalletModal(null); reload(); }} />
      <AccountModal value={accModal} onClose={() => setAccModal(null)} wsId={wsId} onSaved={() => { setAccModal(null); reload(); }} />
      <TransferModal open={transfer} onClose={() => setTransfer(false)} accounts={accounts} wallets={wallets} wsId={wsId} cur={cur} onSaved={() => { setTransfer(false); reload(); }} />
      <ReceiveModal wallet={receive} onClose={() => setReceive(null)} accounts={accounts} cats={cats} wsId={wsId} onSaved={() => { setReceive(null); reload(); }} />
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
  // داخل محفظة: التحويل الداخل يُحسب موجب
  const incoming = isTransfer && focus ? focus.has(t.to_account_id ?? "") && !focus.has(t.account_id ?? "") : false;
  const sign = t.type === "income" || incoming ? "+" : isTransfer && focus?.has(t.to_account_id ?? "") ? "↔" : "−";
  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ink/[.03]">
      <span className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: (isTransfer ? "#64748b" : c?.color ?? "#94a3b8") + "1a" }}>{isTransfer ? "↔️" : c?.icon ?? "💳"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{t.note || (isTransfer ? "تحويل" : c?.name) || "—"}</p>
        <p className="text-[11px] text-muted truncate">
          {isTransfer ? `${accLabel(from, wallets)} ← ${accLabel(to, wallets)}` : [c?.name, from ? accLabel(from, wallets) : null].filter(Boolean).join(" · ")} · {friendlyDate(t.date)}
        </p>
      </div>
      <span className={cn("font-semibold text-sm whitespace-nowrap", (t.type === "income" || incoming) && "text-green-600", isTransfer && !incoming && "text-muted")}>{sign}{money(Number(t.amount), cur)}</span>
      {onDelete && <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100" onClick={onDelete}><Trash2 size={13} /></button>}
    </div>
  );
}

export function AccountSelect({ accounts, wallets, value, onChange, className, allowNone = true }: {
  accounts: Account[]; wallets: Wallet[]; value: string; onChange: (v: string) => void; className?: string; allowNone?: boolean;
}) {
  return (
    <select className={cn("input w-auto", className)} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">— بدون حساب —</option>}
      {wallets.map((w) => (
        <optgroup key={w.id} label={`${w.icon} ${w.name}`}>
          {accounts.filter((a) => a.wallet_id === w.id).map((a) => <option key={a.id} value={a.id}>{ACC[a.type].i} {a.name} ({w.name})</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function WalletModal({ value, onClose, wsId, count, hasAccounts, onSaved }: {
  value: Wallet | "new" | null; onClose: () => void; wsId: string; count: number; hasAccounts: boolean; onSaved: () => void;
}) {
  const edit = value && value !== "new" ? value : null;
  const [k, setK] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", icon: "👛", color: COLORS[0], note: "", monthly: "", day: "", bank: "", cash: "", withBank: true, withCash: true });
  const key = value === "new" ? "new" : edit?.id ?? null;
  if (key !== k) {
    setK(key);
    setF({ name: edit?.name ?? "", icon: edit?.icon ?? "👛", color: edit?.color ?? COLORS[count % COLORS.length], note: edit?.note ?? "",
      monthly: edit?.monthly_amount ? String(edit.monthly_amount) : "", day: edit?.monthly_day ? String(edit.monthly_day) : "", bank: "", cash: "", withBank: true, withCash: true });
  }
  const save = async () => {
    if (!f.name.trim()) return;
    const sb = supabase();
    const row = { name: f.name.trim(), icon: f.icon || "👛", color: f.color, note: f.note || null, monthly_amount: f.monthly ? Number(f.monthly) : null, monthly_day: f.day ? Number(f.day) : null };
    if (edit) await sb.from("fin_wallets").update(row).eq("id", edit.id);
    else {
      const { data: w } = await sb.from("fin_wallets").insert({ ...row, workspace_id: wsId, position: count }).select().single();
      if (w) {
        const accs = [];
        if (f.withBank) accs.push({ workspace_id: wsId, wallet_id: w.id, name: "الحساب البنكي", type: "bank", opening_balance: Number(f.bank || 0), is_default: !hasAccounts, position: 0 });
        if (f.withCash) accs.push({ workspace_id: wsId, wallet_id: w.id, name: "نقد", type: "cash", opening_balance: Number(f.cash || 0), is_default: !hasAccounts && !f.withBank, position: 1 });
        if (accs.length) await sb.from("fin_accounts").insert(accs);
      }
    }
    onSaved();
  };
  return (
    <Modal open={!!value} onClose={onClose} title={edit ? "تعديل المحفظة" : "محفظة جديدة"}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="input w-16 text-center text-lg" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} />
          <input className="input" autoFocus placeholder="مثال: فلوس أبوي، الراتب، فري لانس" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <input className="input" placeholder="وصف (اختياري)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <div className="flex gap-2">{COLORS.map((c) => <button key={c} onClick={() => setF({ ...f, color: c })} className={cn("h-7 w-7 rounded-full", f.color === c && "ring-4 ring-offset-2 ring-offset-surface")} style={{ background: c, ["--tw-ring-color" as any]: c + "55" }} />)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">دخل شهري ثابت (اختياري)</label><input type="number" inputMode="decimal" className="input" placeholder="مثال: الراتب" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} /></div>
          <div><label className="label">يوم الاستلام</label><input type="number" min={1} max={31} className="input" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></div>
        </div>
        {!edit && (
          <div className="rounded-2xl border border-line p-3 space-y-2">
            <p className="text-xs text-muted">الحسابات داخل المحفظة ورصيدها الحالي</p>
            {([["withBank", "bank", "🏦 حساب بنكي"], ["withCash", "cash", "💵 نقد"]] as const).map(([w, b, l]) => (
              <label key={w} className="flex items-center gap-2">
                <input type="checkbox" checked={f[w]} onChange={(e) => setF({ ...f, [w]: e.target.checked })} className="accent-[rgb(var(--brand))]" />
                <span className="text-sm flex-1">{l}</span>
                <input type="number" inputMode="decimal" disabled={!f[w]} className="input h-9 w-32" placeholder="الرصيد الحالي" value={f[b]} onChange={(e) => setF({ ...f, [b]: e.target.value })} />
              </label>
            ))}
          </div>
        )}
        <button className="btn-primary w-full" onClick={save}>حفظ</button>
      </div>
    </Modal>
  );
}

function AccountModal({ value, onClose, wsId, onSaved }: { value: { wallet: Wallet; acc?: Account } | null; onClose: () => void; wsId: string; onSaved: () => void }) {
  const acc = value?.acc;
  const [k, setK] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", type: "bank" as AccountType, opening: "", def: false });
  const key = value ? acc?.id ?? "new:" + value.wallet.id : null;
  if (key !== k) { setK(key); setF({ name: acc?.name ?? "", type: acc?.type ?? "bank", opening: acc ? String(acc.opening_balance) : "", def: acc?.is_default ?? false }); }
  if (!value) return null;
  const save = async () => {
    const sb = supabase();
    const row = { name: f.name.trim() || ACC[f.type].l, type: f.type, opening_balance: Number(f.opening || 0), is_default: f.def };
    if (acc) await sb.from("fin_accounts").update(row).eq("id", acc.id);
    else await sb.from("fin_accounts").insert({ ...row, workspace_id: wsId, wallet_id: value.wallet.id, position: Date.now() });
    onSaved();
  };
  const del = async () => {
    if (!acc || !confirm(`حذف «${acc.name}»؟ العمليات المسجلة عليه تبقى بدون حساب.`)) return;
    await supabase().from("fin_accounts").delete().eq("id", acc.id); onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`${acc ? "تعديل حساب" : "حساب جديد"} · ${value.wallet.icon} ${value.wallet.name}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(ACC) as AccountType[]).map((t) => (
            <button key={t} onClick={() => setF({ ...f, type: t })} className={cn("rounded-xl border py-2 text-xs", f.type === t ? "border-brand bg-brand/10 text-brand font-medium" : "border-line")}>{ACC[t].i}<br />{ACC[t].l}</button>
          ))}
        </div>
        <input className="input" placeholder="الاسم، مثال: الراجحي، الأهلي، الكاش اللي معي" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div><label className="label">الرصيد الافتتاحي</label><input type="number" inputMode="decimal" className="input" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.def} onChange={(e) => setF({ ...f, def: e.target.checked })} className="accent-[rgb(var(--brand))]" /> الحساب الافتراضي (للصرفية السريعة واختصار الآيفون)</label>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={save}>حفظ</button>
          {acc && <button className="btn-outline text-red-600" onClick={del}><Trash2 size={15} /></button>}
        </div>
      </div>
    </Modal>
  );
}

function TransferModal({ open, onClose, accounts, wallets, wsId, cur, onSaved }: {
  open: boolean; onClose: () => void; accounts: Account[]; wallets: Wallet[]; wsId: string; cur: string; onSaved: () => void;
}) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [amt, setAmt] = useState(""); const [note, setNote] = useState(""); const [date, setDate] = useState(today());
  // نبدأ من أول حساب بنكي إلى أول حساب نقد (سحب كاش هو الأكثر)
  const [k, setK] = useState(false);
  if (open !== k) {
    setK(open);
    if (open) {
      const f = accounts.find((a) => a.type === "bank") ?? accounts[0];
      setFrom(f?.id ?? ""); setTo((accounts.find((a) => a.type === "cash" && a.wallet_id === f?.wallet_id) ?? accounts.find((a) => a.id !== f?.id))?.id ?? "");
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
        <input className="input" placeholder="ملاحظة، مثال: سحب كاش من الصراف" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary w-full" disabled={!from || !to || from === to || !Number(amt)} onClick={save}><ArrowLeftRight size={15} /> تحويل</button>
      </div>
    </Modal>
  );
}

function ReceiveModal({ wallet, onClose, accounts, cats, wsId, onSaved }: {
  wallet: Wallet | null; onClose: () => void; accounts: Account[]; cats: Category[]; wsId: string; onSaved: () => void;
}) {
  const accs = wallet ? accounts.filter((a) => a.wallet_id === wallet.id) : [];
  const [acc, setAcc] = useState(""); const [amt, setAmt] = useState(""); const [k, setK] = useState<string | null>(null);
  if ((wallet?.id ?? null) !== k) { setK(wallet?.id ?? null); setAmt(wallet?.monthly_amount ? String(wallet.monthly_amount) : ""); setAcc(accs.find((a) => a.type === "bank")?.id ?? accs[0]?.id ?? ""); }
  if (!wallet) return null;
  const save = async () => {
    const n = Number(amt); if (!n) return;
    const cat = cats.find((c) => c.type === "income" && /راتب|مصروف|دخل/.test(c.name)) ?? cats.find((c) => c.type === "income");
    await supabase().from("transactions").insert({ workspace_id: wsId, type: "income", amount: n, account_id: acc || null, category_id: cat?.id ?? null, note: `${wallet.name} — الدفعة الشهرية`, date: today() });
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`💰 استلام ${wallet.name}`}>
      <div className="space-y-3">
        <input type="number" inputMode="decimal" className="input" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}>
          {accs.map((a) => <option key={a.id} value={a.id}>{ACC[a.type].i} {a.name}</option>)}
        </select>
        <button className="btn-primary w-full" onClick={save}>سجّل الاستلام</button>
      </div>
    </Modal>
  );
}
