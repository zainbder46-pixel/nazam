// عامل الخدمة — يستقبل إشعارات «نظام»
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
