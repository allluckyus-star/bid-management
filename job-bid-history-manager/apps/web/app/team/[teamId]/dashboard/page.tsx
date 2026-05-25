import { DashboardApp } from "@/components/dashboard-app";

type Props = { params: Promise<{ teamId: string }> };

export default async function TeamDashboardPage({ params }: Props) {
  const { teamId } = await params;
  return <DashboardApp teamId={teamId} />;
}
