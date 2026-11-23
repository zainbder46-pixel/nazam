"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

// المزامنة: التعديلات اللي انحفظت بدون نت (في عامل الخدمة) نرفعها بتوكن الجلسة الحالي

type Item = { k: number; url: string; method: string; headers: Record<string, string>; body: string; table: string; at: number };

const db = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open("nz-offline", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "k", autoIncrement: true });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function all(): Promise<Item[]> {
  const d = await db();
  return new Promise((res) => { const q = d.transaction("queue").objectStore("queue").getAll(); q.onsuccess = () => res(q.result as Item[]); q.onerror = () => res([]); });
}
async function del(k: number) {
  const d = await db();
  return new Promise<void>((res) => { const t = d.transaction("queue", "readwrite"); t.objectStore("queue").delete(k); t.oncomplete = () => res(); t.onerror = () => res(); });
}

export async function pendingCount() { try { return (await all()).length; } catch { return 0; } }

let flushing: Promise<number> | null = null;
export function flushQueue() {
  if (flushing) return flushing;
  flushing = (async () => {
    let done = 0;
    const items = (await all()).sort((a, b) => a.k - b.k);
    if (!items.length) return 0;
    const sb = supabase();
    let token = (await sb.auth.getSession()).data.session?.access_token;
    for (const it of items) {
      const send = () => fetch(it.url, { method: it.method, headers: { ...it.headers, Authorization: `Bearer ${token}`, "x-nz-replay": "1" }, body: it.method === "GET" ? undefined : it.body || undefined });
      let res: Response;
      try { res = await send(); } catch { break; }                       // لسا ما فيه نت
      if (res.status === 401) {
        token = (await sb.auth.refreshSession()).data.session?.access_token;
        try { res = await send(); } catch { break; }
      }
      if (res.status >= 500) break;                                       // نجرب بعدين
      await del(it.k);                                                    // نجحت، أو رفضها السيرفر (ما نعلّق الطابور)
      done++;
    }
    if (done) { window.dispatchEvent(new Event("nz:refresh")); window.dispatchEvent(new CustomEvent("nz:synced", { detail: done })); }
    return done;
  })().finally(() => { flushing = null; });
  return flushing;
}

const CORE = ["/", "/tasks", "/finance", "/pages", "/faith", "/spaces", "/chat", "/q"];

/** يسجّل عامل الخدمة، يجهز الصفحات للشغل بدون نت، ويزامن أول ما يرجع النت */
export function useOffline() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [synced, setSynced] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const refresh = () => pendingCount().then(setPending);
    const sync = async () => { if (navigator.onLine) { await flushQueue(); refresh(); } };
    const goOnline = () => { setOnline(true); sync(); };
    const goOffline = () => setOnline(false);
    const onSynced = (e: Event) => { setSynced((e as CustomEvent).detail); setTimeout(() => setSynced(0), 2500); };
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "nz:queue") { setPending(e.data.count); if (navigator.onLine) sync(); } };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(async (reg) => {
        await navigator.serviceWorker.ready;
        (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "warm", paths: CORE });
      }).catch(() => {});
      navigator.serviceWorker.addEventListener("message", onMsg);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("nz:synced", onSynced);
    refresh(); sync();
    const t = setInterval(() => { refresh(); sync(); }, 30_000);
    return () => {
      window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline);
      window.removeEventListener("nz:synced", onSynced); navigator.serviceWorker?.removeEventListener("message", onMsg); clearInterval(t);
    };
  }, []);

  return { online, pending, synced };
}

/** عند الخروج: نمسح البيانات المحفوظة على الجهاز */
export async function clearOffline() {
  try { navigator.serviceWorker?.controller?.postMessage({ type: "clear" }); } catch {}
  try { for (const k of await caches.keys()) if (k.startsWith("nz-data") || k.startsWith("nz-pages")) await caches.delete(k); } catch {}
}
