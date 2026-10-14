import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BrowserOnly } from "@/components/browser-only";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="px-4 py-5 sm:px-8">
        <Link href="/" aria-label="Tailorite home">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:pt-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
          <Suspense fallback={<FormSkeleton />}>
            <BrowserOnly reason="Sign-in forms read the current session and URL.">{children}</BrowserOnly>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
