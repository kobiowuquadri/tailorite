import { Suspense, type ReactNode } from "react";
import { BrowserOnly } from "@/components/browser-only";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthVisual } from "@/components/auth/auth-visual";
import { Copyright } from "@/components/marketing/copyright";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Suspense fallback={<div className="hidden bg-[#0b1b33] lg:block" />}>
        <AuthVisual variant="panel" />
      </Suspense>
      <div className="flex min-h-dvh flex-col">
        <Suspense fallback={<div className="h-44 bg-[#0b1b33] lg:hidden" />}>
          <AuthVisual variant="banner" />
        </Suspense>
        <main className="-mt-16 flex flex-1 items-start justify-center px-4 pb-16 sm:px-8 lg:mt-0 lg:items-center lg:pb-24">
          <div className="animate-fade-up relative w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-[0_20px_50px_-30px_rgb(11_27_51/0.45)] sm:p-8">
            <Suspense fallback={<FormSkeleton />}>
              <BrowserOnly reason="Sign-in forms read the current session and URL.">{children}</BrowserOnly>
            </Suspense>
          </div>
        </main>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-6 text-center text-xs text-muted-foreground">
          <Copyright />
          <span aria-hidden="true">·</span>
          <p>
            Photos:{" "}
            <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              Pexels
            </a>
          </p>
        </div>
      </div>
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
