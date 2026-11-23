"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase/client";
import type { Task } from "./types";

// كاش بسيط بين الصفحات: نعرض آخر نسخة فورًا ونحدّثها بالخلفية
const cache = new Map<string, Task[]>();

export function useTasks(wsId: string | undefined, version = 0) {
  const [tasks, setTasksState] = useState<Task[]>(() => (wsId && cache.get(wsId)) || []);
  const [loading, setLoading] = useState(() => !(wsId && cache.has(wsId)));

  const setTasks = useCallback((next: Task[] | ((cur: Task[]) => Task[])) => {
    setTasksState((cur) => {
      const v = typeof next === "function" ? (next as (c: Task[]) => Task[])(cur) : next;
      if (wsId) cache.set(wsId, v);
      return v;
    });
  }, [wsId]);

  const load = useCallback(async () => {
    if (!wsId) return;
    const { data } = await supabase().from("tasks").select("*").eq("workspace_id", wsId)
      .order("position", { ascending: true }).limit(3000);
    setTasks(data ?? []);
    setLoading(false);
  }, [wsId, setTasks]);

  useEffect(() => {
    if (wsId && cache.has(wsId)) { setTasksState(cache.get(wsId)!); setLoading(false); } else setLoading(true);
    load();
  }, [load, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // بعد «تراجع» نعيد تحميل المهام
  useEffect(() => {
    const on = () => load();
    window.addEventListener("nz:refresh", on);
    return () => window.removeEventListener("nz:refresh", on);
  }, [load]);

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
