import { AnalyticsPageClient } from "@/components/dashboard/analytics-page-client";

type Props = { params: Promise<{ teamId: string }> };

export default async function AnalyticsPage({ params }: Props) {
  const { teamId } = await params;
  return <AnalyticsPageClient />;
}
