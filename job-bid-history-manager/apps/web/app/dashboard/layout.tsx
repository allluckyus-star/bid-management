import { redirect } from "next/navigation";

import { QueryProvider } from "@/providers/query-provider";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/auth/login");
  }
  return <QueryProvider>{children}</QueryProvider>;
}
