import { TeamResumesPage } from "@/components/resumes/team-resumes-page";

type Props = { params: Promise<{ teamId: string }> };

export default async function TeamResumesRoute({ params }: Props) {
  const { teamId } = await params;
  return <TeamResumesPage teamId={teamId} />;
}
