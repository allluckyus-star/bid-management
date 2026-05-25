import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveDashboardRedirect } from "@/lib/teams/redirect";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  redirect(await resolveDashboardRedirect(data.user.id));
}
