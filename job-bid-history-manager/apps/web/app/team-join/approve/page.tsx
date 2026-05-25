"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveJoinRequest } from "@/lib/api/client";

function ApproveJoinInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestId = searchParams.get("request_id") ?? "";
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!requestId || !token) {
      setStatus("error");
      setMessage("Missing request_id or token in the link.");
      return;
    }

    let cancelled = false;
    setStatus("working");

    void approveJoinRequest(requestId, token)
      .then((res) => {
        if (cancelled) return;
        setStatus("done");
        setMessage("You have been added to the team.");
        toast.success("Join request approved");
        router.push(`/team/${res.team_id}/dashboard`);
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        const msg = e instanceof Error ? e.message : "Approval failed";
        setMessage(msg);
        toast.error(msg);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId, token, router]);

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-bold">Approve team join</h1>
      {status === "working" ? (
        <p className="text-sm text-muted-foreground">Confirming your approval…</p>
      ) : (
        <p className="text-sm">{message}</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link href="/teams">All teams</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}

export default function TeamJoinApprovePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ApproveJoinInner />
      </Suspense>
    </div>
  );
}
