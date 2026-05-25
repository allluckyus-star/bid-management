import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/teams/redirect";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect(await resolvePostLoginPath(data.user.id));
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold tracking-tight">Job Bid History Manager</h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Shared team bid board on the web — no local gateway or Tauri required.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Setup: copy <code className="rounded bg-muted px-1">.env.example</code> →{" "}
        <code className="rounded bg-muted px-1">.env.local</code>, run SQL migration in
        Supabase, then <code className="rounded bg-muted px-1">npm run dev:web</code>.
      </p>
    </main>
  );
}
