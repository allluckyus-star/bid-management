import { redirect } from "next/navigation";

import { DashboardApp } from "@/components/dashboard-app";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  return <DashboardApp />;
}
