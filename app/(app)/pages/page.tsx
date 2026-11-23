"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Search, Star } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Empty, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import type { Page } from "@/lib/types";
import { createPage } from "@/lib/pages";

type Row = Pick<Page, "id" | "title" | "icon" | "parent_id" | "is_favorite" | "updated_at" | "content">;

export default function PagesIndex() {
  const { ws, canEdit } = useApp();
  const router = useRouter();
  const [pages, setPages] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!ws) return;
    setPages(null);
    supabase().from("pages").select("id,title,icon,parent_id,is_favorite,updated_at,content").eq("workspace_id", ws.id)
      .order("updated_at", { ascending: false }).then(({ data }) => setPages(data ?? []));
  }, [ws]);

  const add = async () => { if (!ws) return; const id = await createPage(ws.id); if (id) router.push(`/pages/${id}`); };
  const snippet = (p: Row) => (p.content ?? []).map((b) => b.text).filter(Boolean).join(" · ").slice(0, 110);
  const filtered = (pages ?? []).filter((p) => !q || p.title.includes(q) || snippet(p).includes(q));
  const favs = filtered.filter((p) => p.is_favorite);
  const rest = filtered.filter((p) => !p.is_favorite);
  const path = (p: Row) => { const parent = pages?.find((x) => x.id === p.parent_id); return parent ? `${parent.icon} ${parent.title} / ` : ""; };

  const Card = ({ p }: { p: Row }) => (
    <Link href={`/pages/${p.id}`} className="card p-4 hover:-translate-y-0.5 hover:shadow-lg transition block anim-rise">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{p.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted truncate">{path(p)}</p>
          <p className="font-semibold truncate flex items-center gap-1.5">{p.title}{p.is_favorite && <Star size={12} className="text-gold fill-gold" />}</p>
          <p className="text-xs text-muted mt-1 line-clamp-2 min-h-[2rem]">{snippet(p) || "صفحة فارغة"}</p>
          <p className="text-[11px] text-muted mt-2">{new Date(p.updated_at).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" })}</p>
        </div>
      </div>
    </Link>
  );

  return (
    <div>
      <PageHeader title="الصفحات" subtitle="ملاحظات، خطط، محاضر اجتماعات، وأي شي تبي تكتبه"
        actions={canEdit && <button className="btn-primary" onClick={add}><Plus size={16} /> صفحة جديدة</button>} />
      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pr-9" placeholder="ابحث في الصفحات..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!pages ? <Spinner /> : filtered.length === 0 ? (
        <Empty icon="📝" title="ما فيه صفحات" hint="أنشئ أول صفحة لك" action={canEdit && <button className="btn-primary" onClick={add}><Plus size={16} /> صفحة جديدة</button>} />
      ) : (
        <div className="space-y-8">
          {favs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted mb-3">⭐ المفضلة</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{favs.map((p) => <Card key={p.id} p={p} />)}</div>
            </section>
          )}
          <section>
            <h2 className="text-sm font-semibold text-muted mb-3">كل الصفحات</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{rest.map((p) => <Card key={p.id} p={p} />)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
