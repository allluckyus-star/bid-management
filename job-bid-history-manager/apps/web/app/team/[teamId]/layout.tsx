import { redirect } from "next/navigation";

import { TeamLayoutProvider } from "@/components/teams/team-layout-provider";
import { normalizeTimeZone } from "@/lib/datetime/zoned";
import { QueryProvider } from "@/providers/query-provider";
import { createClient } from "@/lib/supabase/server";

type Props = {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
};

export default async function TeamLayout({ children, params }: Props) {
  const { teamId } = await params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth.user) {
    redirect("/auth/login");
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/teams");
  }

  const { data: team } = await supabase
    .from("teams")
    .select("timezone")
    .eq("id", teamId)
    .maybeSingle();

  const timezone = normalizeTimeZone(team?.timezone);

  return (
    <QueryProvider>
      <TeamLayoutProvider teamId={teamId} timezone={timezone}>
        {children}
      </TeamLayoutProvider>
    </QueryProvider>
  );
}
