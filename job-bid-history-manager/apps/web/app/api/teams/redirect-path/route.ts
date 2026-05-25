import { NextResponse } from "next/server";

import { requireAuthUser, teamAccessToResponse } from "@/lib/teams/access";
import { resolvePostLoginPath } from "@/lib/teams/redirect";

export async function GET() {
  try {
    const { user } = await requireAuthUser();
    const path = await resolvePostLoginPath(user.id);
    return NextResponse.json({ path });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
