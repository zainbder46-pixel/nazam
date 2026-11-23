import { createClient } from "@supabase/supabase-js";

// اختصار الآيفون: يسجّل الصرفية بدون فتح الموقع
//   GET /api/q?t=TOKEN&cats=1             → قائمة الفئات (JSON) لـ «اختيار من القائمة»
//   GET /api/q?t=TOKEN&a=25&c=مطاعم&n=...  → يسجّل ويرجع نص للإشعار
export const dynamic = "force-dynamic";

const toEn = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, ".").replace(/[^\d.]/g, "");
const txt = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  // يتجاهل أي رموز مخفية (اتجاه النص) تدخل مع اسم المتغير من كيبورد الآيفون
  const get = (k: string) => { for (const [key, v] of p) if (key.replace(/[^a-z]/gi, "") === k) return v; return null; };
  const t = (get("t") ?? "").replace(/[^a-f0-9]/gi, "");
  if (t.length < 20) return txt("⚠️ الرمز ناقص — انسخ الرابط من صفحة الصرفية", 401);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

  if (get("cats") !== null) {
    const { data, error } = await sb.rpc("quick_cats", { p_token: t });
    if (error) return txt("⚠️ " + error.message, 500);
    return Response.json(data ?? [], { headers: { "cache-control": "no-store" } });
  }

  // يقبل «&a=25» وكذلك «=&a25» (لو انكتبت بالمقلوب من كيبورد عربي)
  let a = Number(toEn(get("a") ?? ""));
  if (!a) for (const [key, v] of p) { const m = toEn(key).length && /^\W*a/i.test(key) ? Number(toEn(key + v)) : 0; if (m > 0) { a = m; break; } }
  if (!a || a <= 0) {
    const got = [...p.entries()].filter(([k]) => k.replace(/[^a-z]/gi, "") !== "t").map(([k, v]) => `${k}=${v || "فاضي"}`).join(" ، ");
    return txt(`⚠️ اكتب مبلغ صحيح\nوصلني: ${got || "ولا شي"}`, 400);
  }
  const { data, error } = await sb.rpc("quick_expense", { p_token: t, p_amount: a, p_category: get("c")?.replace(/=+$/, "").trim() || null, p_note: get("n") || null });
  if (error) return txt(error.message.includes("bad token") ? "⚠️ الرمز غلط — انسخ الرابط من جديد" : "⚠️ ما انحفظت: " + error.message, 400);
  const d = data as { category: string; total: number; currency: string };
  return txt(`✅ ${a} ${d.currency}${d.category ? " · " + d.category : ""}\nمصروفك اليوم: ${Number(d.total)} ${d.currency}`);
}
