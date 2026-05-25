import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveDashboardRedirect } from "@/lib/teams/redirect";

export default async function LegacyExtensionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  const base = await resolveDashboardRedirect(data.user.id);
  if (base.startsWith("/team/") && base.endsWith("/dashboard")) {
    redirect(`${base}/extension`);
  }
  redirect("/teams");
}
