import { supabase } from "./supabase/client";

export async function createPage(wsId: string, parentId: string | null = null) {
  const { data } = await supabase().from("pages").insert({
    workspace_id: wsId, parent_id: parentId, title: "صفحة بدون عنوان", position: Date.now(),
  }).select("id").single();
  return data?.id as string | undefined;
}
