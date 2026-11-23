import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { AppProvider } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await serverSupabase();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const user = { id: claims.sub, email: (claims.email as string | undefined) ?? "" };
  return (
    <AppProvider userId={user.id} email={user.email ?? ""}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
