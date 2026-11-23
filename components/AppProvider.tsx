"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Invite, Member, Profile, TaskList, Workspace } from "@/lib/types";

type Ctx = {
  userId: string;
  email: string;
  profile: Profile | null;
  workspaces: Workspace[];
  ws: Workspace | null;
  setWsId: (id: string) => void;
  members: Member[];
  lists: TaskList[];
  invites: Invite[];
  canEdit: boolean;
  reloadWorkspaces: () => Promise<void>;
  reloadLists: () => Promise<void>;
  reloadInvites: () => Promise<void>;
  updateProfile: (p: Partial<Profile>) => Promise<void>;
  quickAddOpen: boolean;
  setQuickAddOpen: (v: boolean) => void;
  tasksVersion: number;
  bumpTasks: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

export function AppProvider({ userId, email, children }: { userId: string; email: string; children: React.ReactNode }) {
  const sb = supabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsId, setWsIdState] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [tasksVersion, setTasksVersion] = useState(0);

  const reloadWorkspaces = useCallback(async () => {
    const { data } = await sb.from("workspace_members").select("role, workspaces(*)").eq("user_id", userId);
    const list: Workspace[] = (data ?? [])
      .filter((r: any) => r.workspaces)
      .map((r: any) => ({ ...r.workspaces, role: r.role }))
      .sort((a: Workspace, b: Workspace) => Number(b.is_personal) - Number(a.is_personal) || a.created_at.localeCompare(b.created_at));
    setWorkspaces(list);
    setWsIdState((cur) => {
      const saved = cur ?? (typeof window !== "undefined" ? localStorage.getItem("ws") : null);
      if (saved && list.some((w) => w.id === saved)) return saved;
      return list[0]?.id ?? null;
    });
  }, [sb, userId]);

  const reloadInvites = useCallback(async () => {
    const { data } = await sb.from("workspace_invites").select("*, workspace:workspaces(name, icon)").eq("status", "pending");
    setInvites(((data as Invite[]) ?? []).filter((i) => i.email.toLowerCase() === email.toLowerCase()));
  }, [sb, email]);

  const ws = useMemo(() => workspaces.find((w) => w.id === wsId) ?? null, [workspaces, wsId]);

  const reloadLists = useCallback(async () => {
    if (!wsId) return;
    const { data } = await sb.from("task_lists").select("*").eq("workspace_id", wsId).order("position");
    setLists(data ?? []);
  }, [sb, wsId]);

  const loadMembers = useCallback(async () => {
    if (!wsId) return;
    const { data: m } = await sb.from("workspace_members").select("*").eq("workspace_id", wsId);
    const ids = (m ?? []).map((x: Member) => x.user_id);
    const { data: p } = ids.length ? await sb.from("profiles").select("*").in("id", ids) : { data: [] as Profile[] };
    setMembers((m ?? []).map((x: Member) => ({ ...x, profile: (p ?? []).find((pp: Profile) => pp.id === x.user_id) })));
  }, [sb, wsId]);

  useEffect(() => {
    sb.from("profiles").select("*").eq("id", userId).single().then(({ data }) => setProfile(data));
    reloadWorkspaces();
    reloadInvites();
  }, [sb, userId, reloadWorkspaces, reloadInvites]);

  useEffect(() => {
    if (!wsId) return;
    localStorage.setItem("ws", wsId);
    reloadLists();
    loadMembers();
  }, [wsId, reloadLists, loadMembers]);

  const updateProfile = useCallback(async (p: Partial<Profile>) => {
    setProfile((cur) => (cur ? { ...cur, ...p } : cur));
    await sb.from("profiles").update(p).eq("id", userId);
  }, [sb, userId]);

  // اختصار N للإضافة السريعة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if ((e.key === "n" || e.key === "ى" || e.key === "N") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setQuickAddOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setQuickAddOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value: Ctx = {
    userId, email, profile, workspaces, ws, setWsId: setWsIdState, members, lists, invites,
    canEdit: ws?.role === "owner" || ws?.role === "editor",
    reloadWorkspaces, reloadLists, reloadInvites, updateProfile,
    quickAddOpen, setQuickAddOpen, tasksVersion, bumpTasks: () => setTasksVersion((v) => v + 1),
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
