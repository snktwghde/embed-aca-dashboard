import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import DashboardShell from "./shell";

export default async function DashboardLayout({ children }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const tenantId = user.app_metadata?.tenant_id;
  const role = user.app_metadata?.role;

  if (!tenantId) {
    redirect("/login");
  }

  return (
    <DashboardShell user={user} tenantId={tenantId} role={role}>
      {children}
    </DashboardShell>
  );
}
