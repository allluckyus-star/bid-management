import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <nav className="w-full border-b border-b-foreground/10">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Job Bid History
          </Link>
          <div className="flex items-center gap-3">
            {!hasEnvVars ? <EnvVarWarning /> : null}
            <Suspense>
              <AuthButton />
            </Suspense>
            <ThemeSwitcher />
          </div>
        </div>
      </nav>
      <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</div>
    </main>
  );
}
