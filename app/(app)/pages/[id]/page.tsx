"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, FilePlus2, Star, Trash2, Check, Loader2 } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { BlockEditor } from "@/components/BlockEditor";
import { Spinner, AutoTextarea } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { createPage } from "@/lib/pages";
import { cn } from "@/lib/utils";
import type { Block, Page } from "@/lib/types";

const EMOJIS = ["📄", "📝", "📌", "📚", "💡", "🎯", "🚀", "💼", "🏠", "🕌", "📖", "💰", "📊", "🗓️", "✅", "🧠", "❤️", "🌿", "⚽", "🎬", "✈️", "🛒", "🍽️", "🏋️", "👨‍👩‍👧", "🤝", "📣", "🧾", "🏢", "⭐"];

export default function PageEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId, workspaces, setWsId, ws } = useApp();
  const [page, setPage] = useState<Page | null>(null);
  const [crumbs, setCrumbs] = useState<Pick<Page, "id" | "title" | "icon">[]>([]);
  const [children, setChildren] = useState<Pick<Page, "id" | "title" | "icon">[]>([]);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [emoji, setEmoji] = useState(false);
  const [missing, setMissing] = useState(false);
  const dirty = useRef<Partial<Page>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const role = workspaces.find((w) => w.id === page?.workspace_id)?.role;
  const canEdit = role === "owner" || role === "editor";

  useEffect(() => {
    const sb = supabase();
    setPage(null); setMissing(false);
    sb.from("pages").select("*").eq("id", id).single().then(async ({ data }) => {
      if (!data) { setMissing(true); return; }
      setPage(data);
      if (ws && data.workspace_id !== ws.id) setWsId(data.workspace_id);
      const trail: Pick<Page, "id" | "title" | "icon">[] = [];
      let parent = data.parent_id;
      while (parent && trail.length < 6) {
        const { data: p } = await sb.from("pages").select("id,title,icon,parent_id").eq("id", parent).single();
        if (!p) break; trail.unshift(p); parent = p.parent_id;
      }
      setCrumbs(trail);
    });
    sb.from("pages").select("id,title,icon").eq("parent_id", id).order("position").then(({ data }) => setChildren(data ?? []));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // مزامنة لحظية لما يعدّل عضو ثاني نفس الصفحة
  useEffect(() => {
    const sb = supabase();
    const ch = sb.channel(`page-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pages", filter: `id=eq.${id}` }, (p: any) => {
        if (p.new.updated_by && p.new.updated_by !== userId && Object.keys(dirty.current).length === 0) setPage(p.new);
      }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id, userId]);

  const flush = useCallback(async () => {
    const patch = dirty.current; dirty.current = {};
    if (!Object.keys(patch).length) return;
    setState("saving");
    await supabase().from("pages").update(patch).eq("id", id);
    setState("saved");
  }, [id]);

  const change = (p: Partial<Page>) => {
    setPage((cur) => (cur ? { ...cur, ...p } : cur));
    dirty.current = { ...dirty.current, ...p };
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); flush(); }, [flush]);

  if (missing) return <div className="text-center py-20"><p className="text-4xl mb-3">🔍</p><p>الصفحة غير موجودة أو ما عندك صلاحية</p><Link href="/pages" className="btn-outline mt-4">رجوع للصفحات</Link></div>;
  if (!page) return <Spinner />;

  const addChild = async () => { const cid = await createPage(page.workspace_id, page.id); if (cid) router.push(`/pages/${cid}`); };
  const del = async () => {
    if (!confirm("حذف الصفحة وكل الصفحات الفرعية؟")) return;
    await supabase().from("pages").delete().eq("id", page.id);
    router.push(page.parent_id ? `/pages/${page.parent_id}` : "/pages");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted mb-8">
        <Link href="/pages" className="hover:text-ink">الصفحات</Link>
        {crumbs.map((c) => (<span key={c.id} className="flex items-center gap-2"><ChevronLeft size={14} /><Link href={`/pages/${c.id}`} className="hover:text-ink truncate max-w-[140px]">{c.icon} {c.title}</Link></span>))}
        <div className="mr-auto flex items-center gap-1">
          <span className="text-xs flex items-center gap-1 ml-2">
            {state === "saving" ? <><Loader2 size={12} className="animate-spin" /> يحفظ</> : state === "saved" ? <><Check size={12} /> محفوظ</> : !canEdit ? "قراءة فقط" : ""}
          </span>
          {canEdit && <>
            <button className="icon-btn" title="مفضلة" onClick={() => change({ is_favorite: !page.is_favorite })}><Star size={16} className={cn(page.is_favorite && "text-gold fill-gold")} /></button>
            <button className="icon-btn" title="صفحة فرعية" onClick={addChild}><FilePlus2 size={16} /></button>
            <button className="icon-btn hover:text-red-600" title="حذف" onClick={del}><Trash2 size={16} /></button>
          </>}
        </div>
      </div>

      <div className="relative">
        <button disabled={!canEdit} onClick={() => setEmoji(!emoji)} className="text-6xl hover:bg-ink/5 rounded-2xl p-1 transition">{page.icon}</button>
        {emoji && (
          <div className="absolute z-20 top-full mt-1 card p-2 grid grid-cols-10 gap-1 anim-pop w-[340px]">
            {EMOJIS.map((e) => <button key={e} onClick={() => { change({ icon: e }); setEmoji(false); }} className="text-xl h-8 w-8 rounded-lg hover:bg-ink/5">{e}</button>)}
          </div>
        )}
      </div>

      <AutoTextarea value={page.title} readOnly={!canEdit} onChange={(e) => change({ title: e.target.value })} placeholder="عنوان الصفحة"
        className="text-4xl font-bold leading-[1.35] mt-3 mb-6 placeholder:text-muted/50" />

      <BlockEditor blocks={page.content as Block[]} onChange={(content) => change({ content })} readOnly={!canEdit} />

      {children.length > 0 && (
        <div className="border-t border-line pt-4 mt-4">
          <p className="text-xs font-semibold text-muted mb-2">الصفحات الفرعية</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {children.map((c) => <Link key={c.id} href={`/pages/${c.id}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 hover:bg-ink/5 text-sm"><span>{c.icon}</span>{c.title}</Link>)}
          </div>
        </div>
      )}
    </div>
  );
}
