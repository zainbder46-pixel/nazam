"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Flame } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { PrayerTracker, useCountdown } from "@/components/PrayerTracker";
import { Modal, PageHeader, Progress, Ring, Segmented } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { CITIES, PRAYERS, PRAYER_STATUS, QURAN_PAGES, fmtTime, prayerTimes } from "@/lib/prayer";
import { addDays, cn, friendlyDate, hijri, money, monthStart, parseYmd, today } from "@/lib/utils";
import type { Habit, HabitLog, PrayerLog } from "@/lib/types";

type Tab = "prayer" | "quran" | "habits" | "fasting";

export default function FaithPage() {
  const [tab, setTab] = useState<Tab>("prayer");
  const { ws, workspaces, setWsId } = useApp();
  const life = workspaces.find((w) => w.is_personal);
  if (ws && !ws.is_personal) return (
    <div className="max-w-md mx-auto text-center py-20">
      <p className="text-5xl mb-4">🕌</p>
      <h1 className="text-xl font-bold">العبادات خاصة فيك</h1>
      <p className="text-sm text-muted mt-2">تظهر في «{life?.name ?? "حياتي"}» فقط، وما يشوفها أحد في مساحات العمل أو المساحات المشتركة.</p>
      {life && <button className="btn-primary mt-6" onClick={() => setWsId(life.id)}>انتقل إلى {life.icon} {life.name}</button>}
    </div>
  );
  return (
    <div>
      <PageHeader title="العبادات" subtitle={hijri()} actions={
        <Segmented value={tab} onChange={setTab} options={[
          { value: "prayer", label: "الصلاة" }, { value: "quran", label: "القرآن" },
          { value: "habits", label: "الأذكار والعادات" }, { value: "fasting", label: "الصيام والصدقة" },
        ]} />
      } />
      {tab === "prayer" && <PrayerTab />}
      {tab === "quran" && <QuranTab />}
      {tab === "habits" && <HabitsTab />}
      {tab === "fasting" && <FastingTab />}
    </div>
  );
}

/* ----------------------------- الصلاة ----------------------------- */
function PrayerTab() {
  const { profile, updateProfile } = useApp();
  const city = profile?.city ?? "jeddah";
  const [date, setDate] = useState(today());
  const [logs, setLogs] = useState<PrayerLog[]>([]);
  const [history, setHistory] = useState<PrayerLog[]>([]);
  const { next, text } = useCountdown(city);
  const times = prayerTimes(city, parseYmd(date));

  useEffect(() => {
    supabase().from("prayer_logs").select("*").eq("date", date).then(({ data }) => setLogs(data ?? []));
  }, [date]);
  useEffect(() => {
    supabase().from("prayer_logs").select("*").gte("date", addDays(today(), -29)).then(({ data }) => setHistory(data ?? []));
  }, [logs]);

  const days = Array.from({ length: 30 }, (_, i) => addDays(today(), i - 29));
  const stats = useMemo(() => {
    const total = days.length * 5;
    const by = (s: string) => history.filter((h) => h.status === s).length;
    const score = history.reduce((s, h) => s + PRAYER_STATUS[h.status].score, 0);
    return { jamaah: by("jamaah"), ontime: by("ontime"), late: by("late"), missed: by("missed"), logged: history.length, total, pct: Math.round((score / (total * 3)) * 100), sunnah: history.filter((h) => h.sunnah).length };
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  // سلسلة الأيام اللي الخمس فيها مسجلة بدون "فاتت"
  const streak = useMemo(() => {
    let s = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = history.filter((h) => h.date === days[i]);
      const ok = d.length === 5 && d.every((h) => h.status !== "missed");
      if (ok) s++; else if (days[i] !== today()) break;
    }
    return s;
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <button className="icon-btn" onClick={() => setDate(addDays(date, -1))}><ChevronRight size={18} /></button>
            <div className="text-center">
              <p className="font-semibold">{friendlyDate(date)}</p>
              <p className="text-[11px] text-muted">{hijri(parseYmd(date))}</p>
            </div>
            <button className="icon-btn" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))}><ChevronLeft size={18} /></button>
          </div>
          <PrayerTracker date={date} city={city} logs={logs} onChange={setLogs} />
          <p className="text-[11px] text-muted mt-3">اضغط على الصلاة لتسجيل حالتها والسنة الراتبة</p>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">مواقيت الصلاة</h3>
            <select className="input h-8 w-auto text-xs" value={city} onChange={(e) => updateProfile({ city: e.target.value })}>
              {Object.entries(CITIES).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            {[...PRAYERS.slice(0, 1), { key: "sunrise" as const, name: "الشروق" }, ...PRAYERS.slice(1)].map((p) => (
              <div key={p.key} className={cn("flex justify-between rounded-lg px-3 py-2 text-sm", date === today() && next.key === p.key && "bg-brand/10 text-brand font-semibold")}>
                <span>{p.name}</span><span className="tabular-nums">{fmtTime(times[p.key])}</span>
              </div>
            ))}
          </div>
          {date === today() && <p className="text-center text-xs text-muted mt-3">باقي على {next.name}: <b className="tabular-nums text-ink" dir="ltr">{text}</b></p>}
          <p className="text-center text-[10px] text-muted mt-1">حسب تقويم أم القرى</p>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-6 mb-5">
          <Ring value={stats.pct} size={72} stroke={7}>{stats.pct}%</Ring>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 flex-1">
            {(["jamaah", "ontime", "late", "missed"] as const).map((k) => (
              <div key={k}><p className="text-[11px] text-muted flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PRAYER_STATUS[k].color }} />{PRAYER_STATUS[k].label}</p><p className="text-xl font-bold">{stats[k]}</p></div>
            ))}
            <div><p className="text-[11px] text-muted flex items-center gap-1"><Flame size={12} className="text-gold" /> سلسلة الأيام</p><p className="text-xl font-bold">{streak}</p></div>
          </div>
        </div>
        <p className="text-xs text-muted mb-2">آخر 30 يوم</p>
        <div className="overflow-x-auto">
          <div className="grid gap-1 min-w-[640px]" style={{ gridTemplateColumns: `60px repeat(30, 1fr)` }}>
            {PRAYERS.map((p) => (
              <div key={p.key} className="contents">
                <span className="text-[11px] text-muted self-center">{p.name}</span>
                {days.map((d) => {
                  const l = history.find((h) => h.date === d && h.prayer === p.key);
                  return <div key={d} title={`${friendlyDate(d)} · ${l ? PRAYER_STATUS[l.status].label : "غير مسجلة"}`} className="aspect-square rounded-[4px]" style={{ background: l ? PRAYER_STATUS[l.status].color : "rgb(var(--ink) / .06)" }} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- القرآن ----------------------------- */
function QuranTab() {
  const { profile, updateProfile } = useApp();
  const goal = profile?.quran_daily_goal ?? 4;
  const [logs, setLogs] = useState<{ id: string; date: string; pages: number; kind: string; note: string | null }[]>([]);
  const [pages, setPages] = useState(goal);
  const [kind, setKind] = useState<"read" | "memorize" | "review">("read");

  const load = () => supabase().from("quran_logs").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).then(({ data }) => setLogs(data ?? []));
  useEffect(() => { load(); }, []);
  useEffect(() => setPages(goal), [goal]);

  const read = logs.filter((l) => l.kind === "read");
  const total = read.reduce((s, l) => s + l.pages, 0);
  const todayPages = read.filter((l) => l.date === today()).reduce((s, l) => s + l.pages, 0);
  const current = total % QURAN_PAGES;
  const remaining = QURAN_PAGES - current;
  const finishDays = Math.ceil(remaining / Math.max(1, goal));
  const juz = Math.floor(current / 20.13) + 1;
  const memorized = logs.filter((l) => l.kind === "memorize").reduce((s, l) => s + l.pages, 0);
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const max = Math.max(goal, ...last14.map((d) => read.filter((l) => l.date === d).reduce((s, l) => s + l.pages, 0)));

  const add = async () => {
    if (pages <= 0) return;
    await supabase().from("quran_logs").insert({ date: today(), pages, kind });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card p-6 flex flex-col items-center text-center">
          <Ring value={(todayPages / goal) * 100} size={120} stroke={10} color="rgb(var(--gold))">
            <div><p className="text-2xl font-bold">{todayPages}</p><p className="text-[10px] text-muted">من {goal} صفحات</p></div>
          </Ring>
          <p className="font-semibold mt-4">ورد اليوم</p>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted">
            الهدف اليومي
            <input type="number" min={1} max={604} className="input h-8 w-16 text-center" value={goal} onChange={(e) => updateProfile({ quran_daily_goal: Math.max(1, Number(e.target.value)) })} />
            صفحة
          </div>
        </section>

        <section className="card p-6 lg:col-span-2">
          <h3 className="font-semibold mb-1">الختمة الحالية</h3>
          <p className="text-sm text-muted mb-4">صفحة {current} من {QURAN_PAGES} · الجزء {Math.min(30, juz)} · {Math.floor(total / QURAN_PAGES)} ختمة مكتملة</p>
          <Progress value={(current / QURAN_PAGES) * 100} color="rgb(var(--gold))" className="h-3" />
          <p className="text-xs text-muted mt-3">بمعدل {goal} صفحات يوميًا تختم خلال <b className="text-ink">{finishDays} يوم</b> ({friendlyDate(addDays(today(), finishDays))})</p>
          <div className="flex flex-wrap items-center gap-2 mt-6 p-3 rounded-2xl bg-ink/[.03]">
            <Segmented value={kind} onChange={setKind} options={[{ value: "read", label: "تلاوة" }, { value: "memorize", label: "حفظ" }, { value: "review", label: "مراجعة" }]} />
            <input type="number" min={1} className="input h-10 w-20 text-center" value={pages} onChange={(e) => setPages(Number(e.target.value))} />
            <span className="text-sm text-muted">صفحة</span>
            <button className="btn-primary mr-auto" onClick={add}><Plus size={16} /> سجّل</button>
          </div>
          {memorized > 0 && <p className="text-xs text-muted mt-3">📗 إجمالي المحفوظ المسجل: {memorized} صفحة</p>}
        </section>
      </div>

      <section className="card p-5">
        <h3 className="font-semibold mb-4">آخر 14 يوم</h3>
        <div className="flex items-end gap-1.5 h-36">
          {last14.map((d) => {
            const v = read.filter((l) => l.date === d).reduce((s, l) => s + l.pages, 0);
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${friendlyDate(d)}: ${v}`}>
                <span className="text-[10px] text-muted">{v || ""}</span>
                <div className="w-full rounded-t-md transition-all" style={{ height: `${(v / max) * 100}%`, minHeight: 3, background: v >= goal ? "rgb(var(--gold))" : "rgb(var(--gold) / .35)" }} />
                <span className="text-[9px] text-muted">{parseYmd(d).getDate()}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-2">
        <h3 className="font-semibold px-3 pt-3 pb-2">السجل</h3>
        {logs.slice(0, 20).map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ink/[.03] text-sm">
            <span className="chip bg-gold/15 text-gold">{l.kind === "read" ? "تلاوة" : l.kind === "memorize" ? "حفظ" : "مراجعة"}</span>
            <span className="flex-1">{l.pages} صفحة</span>
            <span className="text-xs text-muted">{friendlyDate(l.date)}</span>
            <button className="icon-btn h-7 w-7" onClick={async () => { await supabase().from("quran_logs").delete().eq("id", l.id); load(); }}><Trash2 size={13} /></button>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ----------------------------- العادات ----------------------------- */
const HABIT_ICONS = ["🌅", "🌇", "☀️", "🌙", "📿", "🤲", "📖", "🕌", "💧", "🏃", "📚", "🥗", "😴", "✍️", "🧘", "💪"];

function HabitsTab() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📿");
  const [category, setCategory] = useState("faith");
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));

  const load = async () => {
    const sb = supabase();
    const [h, l] = await Promise.all([
      sb.from("habits").select("*").eq("active", true).order("position"),
      sb.from("habit_logs").select("*").gte("date", addDays(today(), -60)),
    ]);
    setHabits(h.data ?? []); setLogs(l.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const done = (h: Habit, d: string) => (logs.find((l) => l.habit_id === h.id && l.date === d)?.count ?? 0) >= h.target;
  const toggle = async (h: Habit, d: string) => {
    const sb = supabase();
    if (done(h, d)) {
      setLogs((c) => c.filter((l) => !(l.habit_id === h.id && l.date === d)));
      await sb.from("habit_logs").delete().eq("habit_id", h.id).eq("date", d);
    } else {
      setLogs((c) => [...c.filter((l) => !(l.habit_id === h.id && l.date === d)), { habit_id: h.id, date: d, count: h.target }]);
      await sb.from("habit_logs").upsert({ habit_id: h.id, date: d, count: h.target }, { onConflict: "habit_id,date" });
    }
  };
  const streak = (h: Habit) => { let s = 0; let d = today(); if (!done(h, d)) d = addDays(d, -1); while (done(h, d) && s < 60) { s++; d = addDays(d, -1); } return s; };

  const add = async () => {
    if (!name.trim()) return;
    await supabase().from("habits").insert({ name: name.trim(), icon, category, position: habits.length });
    setName(""); setModal(false); load();
  };

  return (
    <div className="space-y-4">
      <section className="card p-2 overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-muted text-[11px]">
              <th className="text-right font-medium px-3 py-2">العادة</th>
              {days.map((d) => <th key={d} className="font-medium py-2 w-12">{new Intl.DateTimeFormat("ar-SA-u-nu-latn", { weekday: "short" }).format(parseYmd(d))}<br />{parseYmd(d).getDate()}</th>)}
              <th className="font-medium py-2 w-16">السلسلة</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => (
              <tr key={h.id} className="group border-t border-line">
                <td className="px-3 py-2.5"><span className="ml-2 text-lg">{h.icon}</span>{h.name}</td>
                {days.map((d) => (
                  <td key={d} className="text-center">
                    <button onClick={() => toggle(h, d)} className={cn("h-8 w-8 rounded-xl transition inline-flex items-center justify-center", done(h, d) ? "bg-brand text-white anim-check" : "bg-ink/5 hover:bg-ink/10")}>{done(h, d) && "✓"}</button>
                  </td>
                ))}
                <td className="text-center font-semibold">{streak(h) > 0 && <span className="text-gold">🔥 {streak(h)}</span>}</td>
                <td><button className="icon-btn opacity-0 group-hover:opacity-100" onClick={async () => { if (!confirm("حذف العادة؟")) return; await supabase().from("habits").delete().eq("id", h.id); load(); }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-ghost m-2 text-brand" onClick={() => setModal(true)}><Plus size={16} /> عادة جديدة</button>
      </section>

      <Modal open={modal} onClose={() => setModal(false)} title="عادة جديدة">
        <div className="space-y-4">
          <input className="input" autoFocus placeholder="مثال: الاستغفار 100 مرة" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <div className="flex flex-wrap gap-1">{HABIT_ICONS.map((i) => <button key={i} onClick={() => setIcon(i)} className={cn("h-9 w-9 rounded-lg text-lg", icon === i ? "bg-brand/15 ring-2 ring-brand" : "hover:bg-ink/5")}>{i}</button>)}</div>
          <Segmented value={category} onChange={setCategory} options={[{ value: "faith", label: "دين" }, { value: "health", label: "صحة" }, { value: "life", label: "حياة" }, { value: "work", label: "عمل" }]} />
          <button className="btn-primary w-full" onClick={add}>إضافة</button>
        </div>
      </Modal>
    </div>
  );
}

/* ----------------------------- الصيام والصدقة ----------------------------- */
const FAST_KINDS = { nafl: "نافلة", qada: "قضاء", ramadan: "رمضان", kaffarah: "كفارة" } as const;

function FastingTab() {
  const { profile } = useApp();
  const cur = profile?.currency ?? "ر.س";
  const [fasts, setFasts] = useState<{ id: string; date: string; kind: keyof typeof FAST_KINDS }[]>([]);
  const [sadaqah, setSadaqah] = useState<{ id: string; date: string; amount: number; note: string | null }[]>([]);
  const [fDate, setFDate] = useState(today());
  const [fKind, setFKind] = useState<keyof typeof FAST_KINDS>("nafl");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    const sb = supabase();
    const [f, s] = await Promise.all([
      sb.from("fasting_logs").select("*").order("date", { ascending: false }).limit(100),
      sb.from("sadaqah_logs").select("*").order("date", { ascending: false }).limit(100),
    ]);
    setFasts(f.data ?? []); setSadaqah(s.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const hijriDay = (d: Date) => Number(new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric" }).format(d));
  const upcoming = Array.from({ length: 14 }, (_, i) => addDays(today(), i)).map((d) => {
    const dt = parseYmd(d); const wd = dt.getDay(); const hd = hijriDay(dt);
    const tags = [wd === 1 && "الإثنين", wd === 4 && "الخميس", [13, 14, 15].includes(hd) && "الأيام البيض"].filter(Boolean) as string[];
    return { d, tags };
  }).filter((x) => x.tags.length).slice(0, 5);

  const thisYear = fasts.filter((f) => f.date.slice(0, 4) === today().slice(0, 4));
  const monthSadaqah = sadaqah.filter((s) => s.date >= monthStart()).reduce((a, s) => a + Number(s.amount), 0);

  const addFast = async (d = fDate, k = fKind) => {
    await supabase().from("fasting_logs").upsert({ date: d, kind: k }, { onConflict: "user_id,date" });
    load();
  };
  const addSadaqah = async () => {
    const n = Number(amount); if (!n) return;
    await supabase().from("sadaqah_logs").insert({ amount: n, note: note || null, date: today() });
    setAmount(""); setNote(""); load();
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">🌙 الصيام</h3>
          <span className="text-xs text-muted">{thisYear.length} يوم هذه السنة · {thisYear.filter((f) => f.kind === "qada").length} قضاء</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="date" className="input w-auto" value={fDate} onChange={(e) => setFDate(e.target.value)} />
          <select className="input w-auto" value={fKind} onChange={(e) => setFKind(e.target.value as keyof typeof FAST_KINDS)}>
            {Object.entries(FAST_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary" onClick={() => addFast()}><Plus size={16} /> سجّل</button>
        </div>
        {upcoming.length > 0 && (
          <div className="rounded-2xl bg-gold/10 p-3">
            <p className="text-xs font-semibold text-gold mb-2">أيام صيام مستحبة قادمة</p>
            <div className="space-y-1">
              {upcoming.map((u) => (
                <div key={u.d} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{friendlyDate(u.d)} <span className="text-xs text-muted">· {u.tags.join(" + ")}</span></span>
                  {fasts.some((f) => f.date === u.d) ? <span className="text-xs text-brand">✓ مسجل</span> :
                    <button className="text-xs text-brand font-medium" onClick={() => addFast(u.d, "nafl")}>نويت</button>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {fasts.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-ink/[.03] group">
              <span className="chip bg-brand/10 text-brand">{FAST_KINDS[f.kind]}</span>
              <span className="flex-1">{friendlyDate(f.date)} <span className="text-[11px] text-muted">{hijri(parseYmd(f.date))}</span></span>
              <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100" onClick={async () => { await supabase().from("fasting_logs").delete().eq("id", f.id); load(); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">🤲 الصدقة</h3>
          <span className="text-xs text-muted">هذا الشهر: <b className="text-ink">{money(monthSadaqah, cur)}</b></span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="number" className="input w-28" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input flex-1 min-w-[140px]" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSadaqah()} />
          <button className="btn-primary" onClick={addSadaqah}><Plus size={16} /></button>
        </div>
        <p className="text-[11px] text-muted">«ما نقصت صدقة من مال» — صحيح مسلم</p>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {sadaqah.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-ink/[.03] group">
              <span className="font-semibold w-24">{money(Number(s.amount), cur)}</span>
              <span className="flex-1 text-muted truncate">{s.note}</span>
              <span className="text-xs text-muted">{friendlyDate(s.date)}</span>
              <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100" onClick={async () => { await supabase().from("sadaqah_logs").delete().eq("id", s.id); load(); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
