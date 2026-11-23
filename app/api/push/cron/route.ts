import { createClient } from "@supabase/supabase-js";
import { sendPush, type PushSub } from "@/lib/webpush";
import { PRAYERS, prayerTimes } from "@/lib/prayer";

// تشتغل كل دقيقة من Supabase (pg_cron) — ترسل تذكير المهام، أوقات الصلاة، وأحداث المساحات المشتركة
export const dynamic = "force-dynamic";

type Sub = PushSub & { user_id: string; city: string; tasks: boolean; prayers: boolean };
type Msg = { user_id: string; key?: string; title: string; body?: string; url: string; tag?: string };

const riyadhDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
const riyadhTime = (d: Date) => new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit", hour12: true }).format(d);

export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get("s") ?? "";
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

  const { data: c, error } = await sb.rpc("push_candidates", { p_secret: s });
  if (error || !c) return new Response("forbidden", { status: 403 });
  const subs = c.subs as Sub[];
  if (!subs.length) return Response.json({ sent: 0 });

  const now = new Date();
  const msgs: Msg[] = [];

  // ⏰ المهام اللي جا وقتها
  const wantsTasks = new Set(subs.filter((x) => x.tasks).map((x) => x.user_id));
  for (const t of c.tasks as { id: string; title: string; ws: string; due: string; user_id: string }[]) {
    if (!t.user_id || !wantsTasks.has(t.user_id)) continue;
    msgs.push({ user_id: t.user_id, key: `t:${t.id}:${t.due}`, title: `⏰ ${t.title}`, body: `${t.ws} · حان وقتها`, url: "/", tag: `t-${t.id}` });
  }

  // 🕌 أوقات الصلاة (خلال آخر 10 دقائق)
  const prayerUsers = new Map<string, string>();
  subs.forEach((x) => { if (x.prayers) prayerUsers.set(x.user_id, x.city); });
  for (const [uid, city] of prayerUsers) {
    const times = prayerTimes(city || "jeddah", now);
    for (const p of PRAYERS) {
      const at = times[p.key];
      const diff = now.getTime() - at.getTime();
      if (diff >= 0 && diff < 10 * 60_000)
        msgs.push({ user_id: uid, key: `p:${uid}:${riyadhDate(at)}:${p.key}`, title: `🕌 حان وقت صلاة ${p.name}`, body: `${riyadhTime(at)} · سجّلها بعد ما تصلي 🤍`, url: "/", tag: `p-${p.key}` });
    }
  }

  // ما نرسل نفس الشي مرتين
  let fresh = new Set<string>();
  const keys = msgs.map((m) => m.key!).filter(Boolean);
  if (keys.length) {
    const { data } = await sb.rpc("push_mark", { p_secret: s, p_keys: keys });
    fresh = new Set((data ?? []) as string[]);
  }
  const out = msgs.filter((m) => fresh.has(m.key!));

  // 👥 أحداث المساحات المشتركة + إشعارات التجربة
  const { data: q } = await sb.rpc("push_take_queue", { p_secret: s });
  out.push(...((q ?? []) as Msg[]));

  const vapid = { publicKey: c.vapid_public, privateKey: c.vapid_private, subject: "https://nazam-lyart.vercel.app" };
  let sent = 0;
  await Promise.all(out.flatMap((m) => subs.filter((x) => x.user_id === m.user_id).map(async (x) => {
    try {
      const st = await sendPush(x, { title: m.title, body: m.body ?? "", url: m.url, tag: m.tag }, vapid);
      if (st === 404 || st === 410) await sb.rpc("push_drop", { p_secret: s, p_endpoint: x.endpoint });
      else if (st < 300) sent++;
    } catch {}
  })));
  return Response.json({ sent, candidates: out.length });
}
