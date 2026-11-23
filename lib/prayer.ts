import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import type { PrayerKey } from "./types";

export const CITIES: Record<string, { name: string; lat: number; lng: number }> = {
  jeddah: { name: "جدة", lat: 21.4858, lng: 39.1925 },
  makkah: { name: "مكة المكرمة", lat: 21.3891, lng: 39.8579 },
  madinah: { name: "المدينة المنورة", lat: 24.5247, lng: 39.5692 },
  riyadh: { name: "الرياض", lat: 24.7136, lng: 46.6753 },
  dammam: { name: "الدمام", lat: 26.4207, lng: 50.0888 },
  taif: { name: "الطائف", lat: 21.2703, lng: 40.4158 },
  abha: { name: "أبها", lat: 18.2465, lng: 42.5117 },
  tabuk: { name: "تبوك", lat: 28.3838, lng: 36.555 },
  qassim: { name: "بريدة", lat: 26.3592, lng: 43.9818 },
};

export const PRAYERS: { key: PrayerKey; name: string }[] = [
  { key: "fajr", name: "الفجر" },
  { key: "dhuhr", name: "الظهر" },
  { key: "asr", name: "العصر" },
  { key: "maghrib", name: "المغرب" },
  { key: "isha", name: "العشاء" },
];

export const PRAYER_STATUS = {
  jamaah: { label: "جماعة", color: "#0f766e", score: 3 },
  ontime: { label: "في وقتها", color: "#16a34a", score: 2 },
  late: { label: "متأخرة", color: "#f59e0b", score: 1 },
  missed: { label: "فاتت", color: "#ef4444", score: 0 },
} as const;

export function prayerTimes(city: string, date = new Date()) {
  const c = CITIES[city] ?? CITIES.jeddah;
  const params = CalculationMethod.UmmAlQura();
  const pt = new PrayerTimes(new Coordinates(c.lat, c.lng), date, params);
  return {
    fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha,
  };
}

export function nextPrayer(city: string, now = new Date()) {
  const t = prayerTimes(city, now);
  for (const p of PRAYERS) if (t[p.key] > now) return { ...p, time: t[p.key] };
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  return { ...PRAYERS[0], time: prayerTimes(city, tomorrow).fajr };
}

export const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit", hour12: true }).format(d);

export const QURAN_PAGES = 604;
