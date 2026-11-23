"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Flame, Plus, Wallet } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { useTasks } from "@/lib/useTasks";
import { TaskItem } from "@/components/TaskItem";
import { TaskDetail } from "@/components/TaskDetail";
import { PrayerTracker, useCountdown } from "@/components/PrayerTracker";
import { Empty, Progress, Ring } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { CITIES, QURAN_PAGES } from "@/lib/prayer";
import { cn, gregorianLong, hijri, money, monthEnd, monthStart, today, ymd } from "@/lib/utils";
import type { Habit, HabitLog, PrayerLog, Task } from "@/lib/types";

export default function TodayPage() {
  const { ws, profile, members, lists, canEdit, tasksVersion, setQuickAddOpen, invites, userId } = useApp();
  const personal = !!ws?.is_personal;
  const { tasks, update, remove, add } = useTasks(ws?.id, tasksVersion);
  const [open, setOpen] = useState<Task | null>(null);
  const city = profile?.city ?? "jeddah";
  const { next, text } = useCountdown(city);
  const t0 = today();

  const [prayers, setPrayers] = useState<PrayerLog[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [hlogs, setHlogs] = useState<HabitLog[]>([]);
  const [quran, setQuran] = useState({ today: 0, total: 0 });
  const [fin, setFin] = useState({ income: 0, expense: 0, budget: 0 });

  useEffect(() => {
    if (!ws) return;
    const sb = supabase();
    Promise.all([
      sb.from("transactions").select("amount,type").eq("workspace_id", ws.id).gte("date", monthStart()).lte("date", monthEnd()),
      sb.from("fin_categories").select("monthly_budget").eq("workspace_id", ws.id).eq("type", "expense"),
    ]).then(([tx, cats]) => {
      const rows = tx.data ?? [];
      setFin({
        income: rows.filter((r: any) => r.type === "income").reduce((s: number, r: any) => s + Number(r.amount), 0),
        expense: rows.filter((r: any) => r.type === "expense").reduce((s: number, r: any) => s + Number(r.amount), 0),
        budget: (cats.data ?? []).reduce((s: number, c: any) => s + Number(c.monthly_budget ?? 0), 0),
      });
    });
    if (!ws.is_personal) return;
    sb.from("prayer_logs").select("*").eq("date", t0).then(({ data }) => setPrayers(data ?? []));
    sb.from("habits").select("*").eq("active", true).order("position").then(({ data }) => setHabits(data ?? []));
    sb.from("habit_logs").select("*").eq("date", t0).then(({ data }) => setHlogs(data ?? []));
    sb.from("quran_logs").select("pages,date,kind").eq("kind", "read").then(({ data }) => {
      const rows = data ?? [];
      setQuran({ today: rows.filter((r: any) => r.date === t0).reduce((s: number, r: any) => s + r.pages, 0), total: rows.reduce((s: number, r: any) => s + r.pages, 0) });
    });
  }, [t0, ws]);

  const todays = useMemo(() => tasks.filter((t) => !t.parent_id && t.status !== "done" && t.due_date && t.due_date <= t0)
    .sort((a, b) => Number(a.due_date === t0) - Number(b.due_date === t0) || b.priority - a.priority), [tasks, t0]);
  const mine = useMemo(() => tasks.filter((t) => !t.parent_id && t.status !== "done" && t.assignee_id === userId && !(t.due_date && t.due_date <= t0)), [tasks, userId, t0]);
  const doing = useMemo(() => tasks.filter((t) => !t.parent_id && t.status === "doing"), [tasks]);
  const doneToday = tasks.filter((t) => t.status === "done" && t.completed_at && ymd(new Date(t.completed_at)) === t0).length;
  const taskPct = todays.length + doneToday ? (doneToday / (todays.length + doneToday)) * 100 : 0;

  const habitDone = (h: Habit) => (hlogs.find((l) => l.habit_id === h.id)?.count ?? 0) >= h.target;
  const toggleHabit = async (h: Habit) => {
    const sb = supabase();
    if (habitDone(h)) {
      setHlogs((c) => c.filter((l) => l.habit_id !== h.id));
      await sb.from("habit_logs").delete().eq("habit_id", h.id).eq("date", t0);
    } else {
      setHlogs((c) => [...c.filter((l) => l.habit_id !== h.id), { habit_id: h.id, date: t0, count: h.target }]);
      await sb.from("habit_logs").upsert({ habit_id: h.id, date: t0, count: h.target }, { onConflict: "habit_id,date" });
    }
  };

  const hour = new Date().getHours();
  const greet = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء النور" : "مساء الخير";
  const goal = profile?.quran_daily_goal ?? 4;
  const cur = profile?.currency ?? "ر.س";

  return (
    <div className="space-y-6">
      {invites.length > 0 && (
        <Link href="/spaces" className="flex items-center gap-3 card p-4 border-gold/40 bg-gold/5 anim-rise">
          <span className="text-2xl">📨</span>
          <span className="flex-1 text-sm">عندك {invites.length} دعوة للانضمام لمساحة مشتركة</span>
          <ArrowLeft size={16} className="text-gold" />
        </Link>
      )}

      {/* الترحيب */}
      <section className="relative overflow-hidden rounded-3xl bg-brand text-white p-6 sm:p-8 anim-rise">
        <div className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-gold/30 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-white/70 text-sm">{gregorianLong()} · {hijri()}</p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">{greet}، {profile?.full_name?.split(" ")[0] ?? ""} 👋</h1>
            <p className="text-white/80 mt-2 text-sm">{ws?.icon} {ws?.name} · {todays.length ? `عندك ${todays.length} مهمة اليوم` : "ما عندك مهام متبقية اليوم"}{personal ? ` · ${CITIES[city]?.name}` : ""}</p>
          </div>
          <div className="text-left">
            <p className="text-white/70 text-xs">الصلاة القادمة · {next.name}</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight" dir="ltr">{text}</p>
          </div>
        </div>
      </section>

      {/* الصلوات — في «حياتي» فقط */}
      {personal && <section className="card p-5 anim-rise" style={{ animationDelay: "40ms" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">🕌 صلوات اليوم</h2>
          <span className="text-xs text-muted">{prayers.length}/5 مسجّلة</span>
        </div>
        <PrayerTracker date={t0} city={city} logs={prayers} onChange={setPrayers} compact />
      </section>}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* مهام اليوم */}
        <section className="card p-2 anim-rise" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center gap-3 px-3 pt-3 pb-2">
            <Ring value={taskPct} size={44} stroke={5}>{Math.round(taskPct)}%</Ring>
            <div className="flex-1">
              <h2 className="font-semibold">مهام اليوم</h2>
              <p className="text-xs text-muted">{doneToday} منجزة · {todays.length} متبقية</p>
            </div>
            {canEdit && <button className="icon-btn" onClick={() => setQuickAddOpen(true)}><Plus size={18} /></button>}
            <Link href="/tasks" className="icon-btn"><ArrowLeft size={18} /></Link>
          </div>
          {todays.length === 0 ? <Empty icon="🌤️" title="يومك مرتب" hint="اضغط N لإضافة مهمة" /> :
            todays.slice(0, 10).map((t) => <TaskItem key={t.id} task={t} members={members} canEdit={canEdit} onChange={update} onOpen={setOpen} showArea={personal} />)}
        </section>

        <div className="space-y-6">
          {!personal && (
            <section className="card p-2 anim-rise" style={{ animationDelay: "120ms" }}>
              <h2 className="font-semibold px-3 pt-3 pb-1">🙋 مسندة لك</h2>
              {mine.length === 0 ? <p className="text-sm text-muted px-3 pb-3">ما فيه مهام مسندة لك غير مهام اليوم</p> :
                mine.slice(0, 6).map((t) => <TaskItem key={t.id} task={t} members={members} canEdit={canEdit} onChange={update} onOpen={setOpen} showArea={false} />)}
              {doing.length > 0 && <>
                <h2 className="font-semibold px-3 pt-3 pb-1">⏳ قيد العمل</h2>
                {doing.slice(0, 6).map((t) => <TaskItem key={t.id} task={t} members={members} canEdit={canEdit} onChange={update} onOpen={setOpen} showArea={false} />)}
              </>}
            </section>
          )}
          {/* العادات */}
          {personal && <section className="card p-5 anim-rise" style={{ animationDelay: "120ms" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><Flame size={18} className="text-gold" /> عادات اليوم</h2>
              <span className="text-xs text-muted">{habits.filter(habitDone).length}/{habits.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {habits.map((h) => (
                <button key={h.id} onClick={() => toggleHabit(h)}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-right transition", habitDone(h) ? "bg-brand/10 border-brand/30 text-brand font-medium" : "border-line hover:bg-ink/5")}>
                  <span className="text-lg">{h.icon}</span><span className="truncate flex-1">{h.name}</span>{habitDone(h) && "✓"}
                </button>
              ))}
            </div>
          </section>}

          {/* القرآن */}
          {personal && <Link href="/faith" className="card p-5 flex items-center gap-4 hover:-translate-y-0.5 transition anim-rise" style={{ animationDelay: "160ms" }}>
            <Ring value={(quran.today / goal) * 100} color="rgb(var(--gold))">{quran.today}/{goal}</Ring>
            <div className="flex-1">
              <h2 className="font-semibold flex items-center gap-2"><BookOpen size={16} /> ورد القرآن</h2>
              <p className="text-xs text-muted mt-1">الختمة الحالية: صفحة {quran.total % QURAN_PAGES} من {QURAN_PAGES} · {Math.floor(quran.total / QURAN_PAGES)} ختمة</p>
              <Progress value={((quran.total % QURAN_PAGES) / QURAN_PAGES) * 100} color="rgb(var(--gold))" className="mt-2" />
            </div>
          </Link>}

          {/* المالية */}
          <Link href="/finance" className="card p-5 block hover:-translate-y-0.5 transition anim-rise" style={{ animationDelay: "200ms" }}>
            <h2 className="font-semibold flex items-center gap-2 mb-3"><Wallet size={16} /> مالية {ws?.name} هذا الشهر</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[11px] text-muted">الدخل</p><p className="font-semibold text-green-600 text-sm">{money(fin.income, cur)}</p></div>
              <div><p className="text-[11px] text-muted">المصروف</p><p className="font-semibold text-red-600 text-sm">{money(fin.expense, cur)}</p></div>
              <div><p className="text-[11px] text-muted">المتبقي</p><p className="font-semibold text-sm">{money(fin.income - fin.expense, cur)}</p></div>
            </div>
            {fin.budget > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-muted mb-1"><span>من الميزانية</span><span>{Math.round((fin.expense / fin.budget) * 100)}%</span></div>
                <Progress value={(fin.expense / fin.budget) * 100} color={fin.expense > fin.budget ? "#ef4444" : undefined} />
              </div>
            )}
          </Link>
        </div>
      </div>

      <TaskDetail task={open ? tasks.find((t) => t.id === open.id) ?? null : null} onClose={() => setOpen(null)}
        onChange={update} onDelete={remove} lists={lists} members={members} canEdit={canEdit} allTasks={tasks} onAdd={add} kind={ws?.kind} />
    </div>
  );
}
