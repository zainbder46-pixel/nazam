"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

/** عدد رسائل المحادثة اللي ما قريتها في المساحة الحالية */
export function useUnread(wsId: string | null, userId: string, reading: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!wsId || reading) { setN(0); return; }
    const sb = supabase();
    let alive = true;
    (async () => {
      const { data: p } = await sb.from("chat_prefs").select("last_read_at").eq("workspace_id", wsId).eq("user_id", userId).maybeSingle();
      let q = sb.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).neq("user_id", userId);
      if (p?.last_read_at) q = q.gt("created_at", p.last_read_at);
      const { count } = await q;
      if (alive) setN(count ?? 0);
    })();
    const ch = sb.channel(`unread-${wsId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${wsId}` }, (pl: any) => {
        if (pl.new.user_id !== userId) setN((x) => x + 1);
      }).subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [wsId, userId, reading]);
  return n;
}
