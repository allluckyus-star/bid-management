import Link from "next/link";
import { Briefcase, Puzzle } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = { params: Promise<{ teamId: string }> };

export default async function ApplicationsPage({ params }: Props) {
  const { teamId } = await params;

  return (
    <PageContainer>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            Jobs on the overview
          </CardTitle>
          <CardDescription>
            The full jobs table with filters, tags, resumes, and actions is on Overview. Capture
            jobs with the extension, then manage them there.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/team/${teamId}/dashboard`}>Open jobs table</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/team/${teamId}/dashboard/extension`}>
              <Puzzle className="mr-2 h-4 w-4" />
              Install extension
            </Link>
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
