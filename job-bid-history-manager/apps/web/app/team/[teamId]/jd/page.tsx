import { TeamJdPage } from "@/components/jd/team-jd-page";

type Props = { params: Promise<{ teamId: string }> };

export default async function TeamJdRoute({ params }: Props) {
  const { teamId } = await params;
  return <TeamJdPage teamId={teamId} />;
}
