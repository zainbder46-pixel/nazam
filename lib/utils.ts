import type { Area, Recurrence } from "./types";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const uid = () => Math.random().toString(36).slice(2, 10);

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const monthStart = (d = new Date()) => ymd(new Date(d.getFullYear(), d.getMonth(), 1));
export const monthEnd = (d = new Date()) => ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));

export function nextOccurrence(date: string | null, rec: Recurrence): string | null {
  const base = date ?? today();
  const d = parseYmd(base);
  switch (rec) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekdays": // الأحد–الخميس
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 5 || d.getDay() === 6);
      break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: return date;
  }
  // لو كانت المهمة متأخرة كثير، لا نخليها تتكرر في الماضي
  const t = today();
  let out = ymd(d);
  let guard = 0;
  while (out < t && guard++ < 400) out = nextOccurrence(out, rec)!;
  return out;
}

export function friendlyDate(s: string | null): string {
  if (!s) return "";
  const t = today();
  if (s === t) return "اليوم";
  if (s === addDays(t, 1)) return "بكرة";
  if (s === addDays(t, -1)) return "أمس";
  const d = parseYmd(s);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

export const hijri = (d = new Date()) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(d);

export const gregorianLong = (d = new Date()) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);

export const money = (n: number, cur = "ر.س") =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)} ${cur}`;

export const AREAS: Record<Area, { label: string; color: string; icon: string }> = {
  life: { label: "الحياة", color: "#0f766e", icon: "🌿" },
  work: { label: "العمل", color: "#2563eb", icon: "💼" },
  faith: { label: "الدين", color: "#b45309", icon: "🕌" },
  finance: { label: "المالية", color: "#16a34a", icon: "💰" },
  study: { label: "الدراسة", color: "#7c3aed", icon: "📚" },
  health: { label: "الصحة", color: "#dc2626", icon: "💪" },
};

/** مجالات المهام حسب نوع المساحة: العمل له مجال واحد، والحياة لها مجالاتها */
export const areasFor = (kind?: "life" | "work"): Area[] =>
  kind === "work" ? ["work"] : ["life", "faith", "finance", "study", "health"];

export const RECURRENCE: Record<Recurrence, string> = {
  none: "بدون تكرار", daily: "يوميًا", weekdays: "أيام العمل (أحد–خميس)",
  weekly: "أسبوعيًا", monthly: "شهريًا", yearly: "سنويًا",
};

export const PRIORITY = [
  { v: 0, label: "بدون", color: "#94a3b8" },
  { v: 1, label: "منخفضة", color: "#0ea5e9" },
  { v: 2, label: "متوسطة", color: "#f59e0b" },
  { v: 3, label: "عالية", color: "#ef4444" },
];

/** تحليل الإدخال السريع: "اجتماع مع العميل بكرة !3 #عمل" */
export function parseQuick(input: string) {
  let title = input.trim();
  let due: string | null = null;
  let priority = 0;
  let area: Area | null = null;
  const t = today();
  const rules: [RegExp, () => void][] = [
    [/(^|\s)(اليوم)(\s|$)/, () => (due = t)],
    [/(^|\s)(بكرة|بكره|غدا|غدًا)(\s|$)/, () => (due = addDays(t, 1))],
    [/(^|\s)(بعد بكرة|بعد بكره)(\s|$)/, () => (due = addDays(t, 2))],
    [/(^|\s)(الأسبوع الجاي|الاسبوع الجاي)(\s|$)/, () => (due = addDays(t, 7))],
  ];
  // "بعد بكرة" قبل "بكرة"
  for (const [re, fn] of [rules[2], rules[0], rules[1], rules[3]]) {
    if (re.test(title)) { fn(); title = title.replace(re, " "); break; }
  }
  const p = title.match(/!([1-3])/);
  if (p) { priority = Number(p[1]); title = title.replace(p[0], " "); }
  const tagMap: Record<string, Area> = { "#عمل": "work", "#حياة": "life", "#دين": "faith", "#مالية": "finance", "#دراسة": "study", "#صحة": "health" };
  for (const [tag, a] of Object.entries(tagMap)) if (title.includes(tag)) { area = a; title = title.replace(tag, " "); }
  return { title: title.replace(/\s+/g, " ").trim(), due, priority, area };
}
