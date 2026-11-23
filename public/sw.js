// عامل الخدمة — إشعارات «نظام» + الشغل بدون نت
// الصفحات والملفات تنحفظ، بيانات Supabase تنحفظ آخر نسخة منها،
// وأي تعديل بدون نت ينحفظ في طابور ويرتفع أول ما يرجع النت (المزامنة من التطبيق نفسه بتوكن جديد).

const V = "v3";
const STATIC = "nz-static-" + V, PAGES = "nz-pages-" + V, DATA = "nz-data-" + V;
const SUPA = "https://zwcgzcgdmjkqrzbjrbsr.supabase.co";
const ID_TABLES = new Set(["workspaces", "workspace_invites", "task_lists", "tasks", "pages", "quran_logs", "habits", "fasting_logs",
  "sadaqah_logs", "fin_categories", "transactions", "obligations", "savings_goals", "fin_wallets", "fin_accounts", "messages", "task_completions"]);

// القيم الافتراضية اللي يحطها السيرفر — نحتاجها لعرض الصف قبل المزامنة
const DEFAULTS = {
  tasks: { status: "todo", priority: 0, area: "life", recurrence: "none", kind: "task", parent_id: null, list_id: null, notes: null, due_date: null, due_time: null, assignee_id: null, completed_at: null, position: 0 },
  messages: { body: "", task_id: null, reply_to: null, mentions: [], edited_at: null },
  pages: { icon: "📄", content: [], is_favorite: false, parent_id: null, position: 0 },
};
const withDefaults = (table, r) => ({ ...(DEFAULTS[table] || {}), created_at: new Date().toISOString(), ...r });

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("nz-") && ![STATIC, PAGES, DATA].includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

/* ---------------- طابور التعديلات (IndexedDB) ---------------- */
const db = () => new Promise((res, rej) => {
  const r = indexedDB.open("nz-offline", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "k", autoIncrement: true });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => {
  const t = d.transaction("queue", mode); const s = t.objectStore("queue"); let out; Promise.resolve(fn(s)).then((v) => (out = v));
  t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
}); };
const queueAll = () => tx("readonly", (s) => new Promise((r) => { const q = s.getAll(); q.onsuccess = () => r(q.result); }));
const queueAdd = (item) => tx("readwrite", (s) => { s.add(item); });

const notify = async () => {
  const n = (await queueAll()).length;
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage({ type: "nz:queue", count: n });
};

/* ---------------- مطابقة فلاتر PostgREST البسيطة ---------------- */
const filtersOf = (url) => {
  const f = [];
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) f.push([k, "eq", v.slice(3)]);
    else if (v === "is.null") f.push([k, "null"]);
    else if (v.startsWith("in.(")) f.push([k, "in", v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""))]);
  }
  return f;
};
const matches = (row, f) => f.every(([k, op, v]) => {
  const has = Object.prototype.hasOwnProperty.call(row, k), val = row[k];
  if (op === "null") return !has || val === null;
  if (!has) return false;
  if (op === "eq") return String(val) === v;
  return v.includes(String(val));
});

async function overlay(url, rows) {
  const table = url.pathname.slice("/rest/v1/".length);
  const ops = (await queueAll()).filter((q) => q.table === table);
  if (!ops.length) return rows;
  const want = filtersOf(url);
  let out = rows.slice();
  for (const op of ops) {
    const opUrl = new URL(op.url);
    if (op.method === "POST") {
      const body = JSON.parse(op.body || "[]");
      const conflict = (opUrl.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
      for (const r of Array.isArray(body) ? body : [body]) {
        const row = { ...withDefaults(table, r), created_at: r.created_at || new Date(op.at).toISOString() };
        if (!matches(row, want)) continue;
        const same = (x) => (row.id && x.id === row.id) || (conflict.length && conflict.every((c) => String(x[c]) === String(row[c])));
        const i = out.findIndex(same);
        if (i >= 0) out[i] = { ...out[i], ...row }; else out.push(row);
      }
    } else if (op.method === "PATCH") {
      const f = filtersOf(opUrl), p = JSON.parse(op.body || "{}");
      out = out.map((x) => (matches(x, f) ? { ...x, ...p } : x));
    } else if (op.method === "DELETE") {
      const f = filtersOf(opUrl);
      out = out.filter((x) => !matches(x, f));
    }
  }
  return out;
}

const json = (v, status = 200, extra = {}) => new Response(v === undefined ? null : JSON.stringify(v), { status, headers: { "content-type": "application/json", ...extra } });

async function dataGet(req) {
  const url = new URL(req.url);
  const single = (req.headers.get("accept") || "").includes("vnd.pgrst.object");
  let body, fresh = null;
  try {
    fresh = await fetch(req);
    if (fresh.ok && !single && url.pathname !== "/rest/v1/rpc") (await caches.open(DATA)).put(req.url, fresh.clone());
    else if (fresh.ok && single) (await caches.open(DATA)).put(req.url, fresh.clone());
    if (!fresh.ok) return fresh;
    if (!(await queueAll()).length) return fresh;
    body = await fresh.clone().json();
  } catch {
    const hit = await caches.match(req.url);
    if (!hit) return single ? json({ message: "offline" }, 406) : json([]);
    body = await hit.json();
  }
  const rows = await overlay(url, single ? (body ? [body] : []) : Array.isArray(body) ? body : [body]);
  if (single) return rows.length ? json(rows[0]) : json({ message: "not found" }, 406);
  return json(rows, 200, { "content-range": `0-${Math.max(0, rows.length - 1)}/*` });
}

async function dataWrite(req) {
  if (req.headers.get("x-nz-replay")) return fetch(req);
  const copy = req.clone();
  if (self.navigator.onLine !== false) {
    try { return await fetch(req); } catch { /* بدون نت ← نحفظها */ }
  }
  const url = new URL(copy.url);
  const table = url.pathname.slice("/rest/v1/".length);
  let text = await copy.text();
  const headers = {};
  for (const h of ["apikey", "content-type", "prefer", "accept", "content-profile", "accept-profile"]) { const v = copy.headers.get(h); if (v) headers[h] = v; }
  const upsert = url.searchParams.has("on_conflict") || (headers.prefer || "").includes("resolution=");
  if (copy.method === "POST" && !table.startsWith("rpc/") && ID_TABLES.has(table) && !upsert && text) {
    try {
      const b = JSON.parse(text);
      const add = (r) => (r && typeof r === "object" && !r.id ? { id: crypto.randomUUID(), ...r } : r);
      text = JSON.stringify(Array.isArray(b) ? b.map(add) : add(b));
    } catch {}
  }
  await queueAdd({ url: copy.url, method: copy.method, headers, body: text, table, at: Date.now() });
  notify();
  const wantsRows = (headers.prefer || "").includes("return=representation");
  if (copy.method === "POST" && wantsRows && !table.startsWith("rpc/")) {
    let rows = []; try { const b = JSON.parse(text); rows = (Array.isArray(b) ? b : [b]).map((r) => withDefaults(table, r)); } catch {}
    return (headers.accept || "").includes("vnd.pgrst.object") ? json(rows[0] ?? null, 201) : json(rows, 201);
  }
  if (table.startsWith("rpc/")) return json(null, 200);
  return new Response(null, { status: copy.method === "DELETE" ? 204 : wantsRows ? 200 : 204 });
}

/* ---------------- الصفحات والملفات ---------------- */
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

async function page(req) {
  const url = new URL(req.url);
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected && !url.pathname.startsWith("/login")) (await caches.open(PAGES)).put(url.pathname, res.clone());
    return res;
  } catch {
    const c = await caches.open(PAGES);
    return (await c.match(url.pathname)) || (await c.match("/")) ||
      new Response("<meta charset=utf-8><body dir=rtl style='font-family:system-ui;padding:40px;text-align:center'><h2>📴 بدون نت</h2><p>افتح الصفحة مرة وحدة وأنت متصل عشان تشتغل بعدين بدون نت.</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

// تجهيز الصفحات الأساسية مسبقًا (مع ملفات الجافاسكربت اللي تحتاجها)
async function warm(paths) {
  const pc = await caches.open(PAGES), sc = await caches.open(STATIC);
  for (const p of paths) {
    try {
      const res = await fetch(p, { credentials: "same-origin" });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pc.put(p, res);
      const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
      for (const a of new Set(assets)) if (!(await sc.match(a))) { try { const r = await fetch(a); if (r.ok) await sc.put(a, r); } catch {} }
    } catch {}
  }
}

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "warm") e.waitUntil(warm(d.paths || []));
  if (d.type === "count") e.waitUntil(notify());
  if (d.type === "clear") e.waitUntil(Promise.all([caches.delete(DATA), caches.delete(PAGES)]));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
    if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webp|woff2?)$/.test(url.pathname) || url.pathname === "/apple-icon" || url.pathname === "/manifest.webmanifest")
      return e.respondWith(cacheFirst(req));
    if (req.mode === "navigate") return e.respondWith(page(req));
    return;
  }
  if (url.origin === SUPA && url.pathname.startsWith("/rest/v1/")) {
    if (req.method === "GET") return e.respondWith(dataGet(req));
    if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) return e.respondWith(dataWrite(req));
  }
});

/* ---------------- الإشعارات ---------------- */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "نظام", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "نظام", {
    body: d.body || "",
    icon: "/apple-icon",
    badge: "/apple-icon",
    tag: d.tag,
    data: { url: d.url || "/" },
    lang: "ar",
    dir: "rtl",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; } }
    await self.clients.openWindow(url);
  })());
});
