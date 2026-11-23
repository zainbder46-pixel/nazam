"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { CheckCircle2, Loader2, Mail, Lock, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const sb = supabase();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg({ ok: false, text: error.message === "Invalid login credentials" ? "الإيميل أو كلمة المرور غير صحيحة" : error.message });
      else { router.replace("/"); router.refresh(); }
    } else {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) setMsg({ ok: false, text: error.message });
      else if (data.session) { router.replace("/"); router.refresh(); }
      else setMsg({ ok: true, text: "تم إنشاء الحساب ✅ افتح بريدك واضغط رابط التفعيل ثم سجّل دخولك." });
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm anim-rise">
          <div className="flex items-center gap-3 mb-10">
            <img src="/icon.svg" alt="" className="h-11 w-11" />
            <div>
              <h1 className="text-xl font-bold">نظام</h1>
              <p className="text-xs text-muted">رتّب حياتك، عملك، مالك، وعبادتك</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-1">{mode === "in" ? "أهلًا بعودتك" : "أنشئ حسابك"}</h2>
          <p className="text-sm text-muted mb-6">{mode === "in" ? "سجّل دخولك وكمّل من حيث وقفت" : "دقيقة وحدة وتبدأ"}</p>

          <form onSubmit={submit} className="space-y-3">
            {mode === "up" && (
              <Field icon={<User size={16} />}>
                <input className="input pr-9" placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
            )}
            <Field icon={<Mail size={16} />}>
              <input className="input pr-9" type="email" dir="ltr" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field icon={<Lock size={16} />}>
              <input className="input pr-9" type="password" dir="ltr" placeholder="••••••••" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>

            {msg && (
              <p className={`text-sm rounded-xl px-3 py-2 ${msg.ok ? "bg-brand/10 text-brand" : "bg-red-500/10 text-red-600"}`}>{msg.text}</p>
            )}

            <button className="btn-primary w-full h-11" disabled={loading}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === "in" ? "دخول" : "إنشاء الحساب"}
            </button>
          </form>

          <p className="text-sm text-muted mt-6 text-center">
            {mode === "in" ? "ما عندك حساب؟" : "عندك حساب؟"}{" "}
            <button className="text-brand font-medium" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
              {mode === "in" ? "سجّل الآن" : "سجّل دخولك"}
            </button>
          </p>
        </div>
      </section>

      <section className="hidden lg:flex relative overflow-hidden bg-brand text-white p-12 items-end">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative max-w-md space-y-4">
          <p className="text-3xl font-bold leading-snug">كل شي في مكان واحد.<br />مهامك، صفحاتك، صلاتك، ومصاريفك.</p>
          {["مهام متكررة وقوائم مثل Google Tasks", "صفحات وملاحظات مثل Notion", "تتبع الصلوات والورد والأذكار", "ميزانية والتزامات وأهداف ادخار", "مساحات مشتركة مع فريقك وأهلك"].map((t) => (
            <p key={t} className="flex items-center gap-2 text-white/90"><CheckCircle2 size={18} /> {t}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
      {children}
    </div>
  );
}
