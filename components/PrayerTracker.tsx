"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { PRAYERS, PRAYER_STATUS, fmtTime, nextPrayer, prayerTimes } from "@/lib/prayer";
import { cn } from "@/lib/utils";
import type { PrayerKey, PrayerLog, PrayerStatus } from "@/lib/types";

export function useCountdown(city: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
  const np = nextPrayer(city, now);
  const diff = Math.max(0, np.time.getTime() - now.getTime());
  const h = Math.floor(diff / 3.6e6), m = Math.floor((diff % 3.6e6) / 6e4), s = Math.floor((diff % 6e4) / 1000);
  return { next: np, text: `${h > 0 ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, now };
}

export function PrayerTracker({ date, city, logs, onChange, compact }: {
  date: string; city: string; logs: PrayerLog[]; onChange: (l: PrayerLog[]) => void; compact?: boolean;
}) {
  const [openKey, setOpenKey] = useState<PrayerKey | null>(null);
  const times = prayerTimes(city, new Date(date + "T12:00:00"));
  const now = new Date();

  const set = async (prayer: PrayerKey, status: PrayerStatus | null) => {
    setOpenKey(null);
    const sb = supabase();
    const existing = logs.find((l) => l.prayer === prayer);
    if (!status) {
      onChange(logs.filter((l) => l.prayer !== prayer));
      await sb.from("prayer_logs").delete().eq("date", date).eq("prayer", prayer);
      return;
    }
    const row = { date, prayer, status, sunnah: existing?.sunnah ?? false };
    onChange([...logs.filter((l) => l.prayer !== prayer), row]);
    await sb.from("prayer_logs").upsert(row, { onConflict: "user_id,date,prayer" });
  };

  const toggleSunnah = async (prayer: PrayerKey) => {
    const ex = logs.find((l) => l.prayer === prayer);
    if (!ex) return;
    const row = { ...ex, sunnah: !ex.sunnah };
    onChange(logs.map((l) => (l.prayer === prayer ? row : l)));
    await supabase().from("prayer_logs").update({ sunnah: row.sunnah }).eq("date", date).eq("prayer", prayer);
  };

  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-5" : "grid-cols-1 sm:grid-cols-5")}>
      {PRAYERS.map((p) => {
        const log = logs.find((l) => l.prayer === p.key);
        const st = log ? PRAYER_STATUS[log.status] : null;
        const passed = times[p.key] < now;
        return (
          <div key={p.key} className="relative">
            <button onClick={() => setOpenKey(openKey === p.key ? null : p.key)}
              className={cn("w-full rounded-2xl border p-3 text-center transition hover:-translate-y-0.5", st ? "border-transparent text-white" : "border-line bg-surface", !st && !passed && "opacity-60")}
              style={st ? { background: st.color } : {}}>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className={cn("text-[11px] mt-0.5", st ? "text-white/80" : "text-muted")}>{st ? st.label : fmtTime(times[p.key])}</p>
            </button>
            {openKey === p.key && (
              <div className="absolute z-20 top-full mt-1 right-0 left-0 sm:left-auto sm:w-44 card p-1.5 anim-pop">
                {(Object.keys(PRAYER_STATUS) as PrayerStatus[]).map((k) => (
                  <button key={k} onClick={() => set(p.key, k)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRAYER_STATUS[k].color }} /> {PRAYER_STATUS[k].label}
                  </button>
                ))}
                {log && (
                  <>
                    <button onClick={() => toggleSunnah(p.key)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5 border-t border-line mt-1">
                      {log.sunnah ? "✅" : "⬜"} السنة الراتبة
                    </button>
                    <button onClick={() => set(p.key, null)} className="w-full rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-ink/5">مسح</button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
