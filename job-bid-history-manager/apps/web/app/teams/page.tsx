import { redirect } from "next/navigation";

import { TeamsPageClient } from "@/components/teams/teams-page-client";
import { createClient } from "@/lib/supabase/server";

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  return <TeamsPageClient />;
}
