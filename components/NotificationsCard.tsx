"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const VAPID_PUBLIC = "BJ1UhJsYJ5Yu04iRPb6ZTeIhlYaMn1WGgmSdj_eWFdFrV6RDr2B8Qz6CAyiKxiIVQZ_ftvNnqSztd6524FxCADY";

const toKey = (s: string) => {
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type Prefs = { notify_tasks: boolean; notify_prayers: boolean; notify_shared: boolean };
const LABELS: { k: keyof Prefs; l: string; d: string }[] = [
  { k: "notify_tasks", l: "⏰ تذكير المهام", d: "بوقت المهمة لو حاط لها ساعة" },
  { k: "notify_prayers", l: "🕌 أوقات الصلاة", d: "عند دخول وقت كل صلاة" },
  { k: "notify_shared", l: "👥 المساحات المشتركة", d: "لما أحد يضيف أو يسند لك أو ينجز مهمة" },
];

/** تفعيل إشعارات الجوال (Web Push) — على الآيفون لازم يكون الموقع مضاف للشاشة الرئيسية */
export default function NotificationsCard() {
  const { userId } = useApp();
  const [state, setState] = useState<"loading" | "unsupported" | "needs-install" | "off" | "on" | "denied">("loading");
  const [prefs, setPrefs] = useState<Prefs>({ notify_tasks: true, notify_prayers: true, notify_shared: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase().from("profiles").select("notify_tasks,notify_prayers,notify_shared").eq("id", userId).single();
      if (data) setPrefs(data as Prefs);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setState(ios && !standalone ? "needs-install" : "unsupported"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [userId]);

  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) }));
      const j = sub.toJSON();
      const { error } = await supabase().from("push_subscriptions").upsert(
        { user_id: userId, endpoint: j.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, ua: navigator.userAgent.slice(0, 200) },
        { onConflict: "endpoint" });
      if (error) throw error;
      setState("on");
      setMsg("تم ✅ الإشعارات شغالة على هذا الجهاز");
    } catch (e: any) {
      setMsg("ما زبط: " + (e?.message ?? e));
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
    setState("off"); setBusy(false); setMsg(null);
  };

  const test = async () => {
    await supabase().from("push_queue").insert({ user_id: userId, title: "🔔 نظام", body: "الإشعارات شغالة تمام 👌", url: "/" });
    setMsg("أرسلت تجربة، بتوصلك خلال دقيقة تقريبًا");
  };

  const toggle = async (k: keyof Prefs) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    await supabase().from("profiles").update({ [k]: next[k] }).eq("id", userId);
  };

  return (
    <section className="card p-5 mt-4 max-w-xl">
      <h3 className="font-semibold mb-1 flex items-center gap-2"><Bell size={17} /> إشعارات الجوال</h3>

      {state === "needs-install" && (
        <p className="text-sm text-muted leading-7">
          عشان توصلك إشعارات على الآيفون: افتح الموقع في Safari ← زر المشاركة ← <b>«إضافة إلى الشاشة الرئيسية»</b>،
          وبعدها افتح «نظام» من أيقونته وارجع لهالصفحة.
        </p>
      )}
      {state === "unsupported" && <p className="text-sm text-muted">هذا المتصفح ما يدعم الإشعارات.</p>}
      {state === "denied" && <p className="text-sm text-muted leading-7">الإشعارات مقفلة. افتح الإعدادات ← الإشعارات ← «نظام» وفعّلها، وبعدها ارجع هنا.</p>}

      {(state === "off" || state === "on") && (
        <>
          <p className="text-sm text-muted mb-3">{state === "on" ? "مفعّلة على هذا الجهاز" : "غير مفعّلة على هذا الجهاز"}</p>
          <div className="flex flex-wrap gap-2">
            {state === "off"
              ? <button onClick={enable} disabled={busy} className="btn-primary">{busy ? "يفعّل..." : <><Bell size={15} /> فعّل الإشعارات</>}</button>
              : <>
                  <button onClick={test} className="btn-primary"><Bell size={15} /> أرسل تجربة</button>
                  <button onClick={disable} disabled={busy} className="btn-outline"><BellOff size={15} /> إيقاف</button>
                </>}
          </div>
        </>
      )}
      {msg && <p className="text-sm mt-3">{msg}</p>}

      <div className="mt-4 divide-y divide-line">
        {LABELS.map((x) => (
          <button key={x.k} onClick={() => toggle(x.k)} className="w-full flex items-center gap-3 py-2.5 text-start">
            <span className="flex-1"><span className="text-sm font-medium block">{x.l}</span><span className="text-xs text-muted">{x.d}</span></span>
            <span className={cn("h-6 w-10 rounded-full p-0.5 transition", prefs[x.k] ? "bg-brand" : "bg-ink/15")}>
              <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition", prefs[x.k] ? "-translate-x-4" : "")} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
