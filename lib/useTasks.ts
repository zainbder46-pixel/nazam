"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase/client";
import type { Task } from "./types";

export function useTasks(wsId: string | undefined, version = 0) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!wsId) return;
    const { data } = await supabase().from("tasks").select("*").eq("workspace_id", wsId)
      .order("position", { ascending: true }).limit(3000);
    setTasks(data ?? []);
    setLoading(false);
  }, [wsId]);

  useEffect(() => { setLoading(true); load(); }, [load, version]);

  // تحديث لحظي: أي تعديل من عضو آخر يظهر مباشرة
  useEffect(() => {
    if (!wsId) return;
    const sb = supabase();
    const ch = sb.channel(`tasks-${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${wsId}` }, (p: any) => {
        setTasks((cur) => {
          if (p.eventType === "DELETE") return cur.filter((t) => t.id !== p.old.id);
          const row = p.new as Task;
          return cur.some((t) => t.id === row.id) ? cur.map((t) => (t.id === row.id ? row : t)) : [...cur, row];
        });
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [wsId]);

  const update = (id: string, patch: Partial<Task>) => setTasks((c) => c.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id: string) => setTasks((c) => c.filter((t) => t.id !== id && t.parent_id !== id));
  const add = (t: Task) => setTasks((c) => (c.some((x) => x.id === t.id) ? c : [...c, t]));

  return { tasks, loading, update, remove, add, reload: load };
}
