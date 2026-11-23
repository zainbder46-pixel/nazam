import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { AppProvider } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  return (
    <AppProvider userId={user.id} email={user.email ?? ""}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
