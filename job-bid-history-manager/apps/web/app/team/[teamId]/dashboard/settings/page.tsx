import { SettingsPageClient } from "@/components/dashboard/settings-page-client";

type Props = { params: Promise<{ teamId: string }> };

export default async function SettingsPage({ params }: Props) {
  const { teamId } = await params;
  return <SettingsPageClient teamId={teamId} />;
}
