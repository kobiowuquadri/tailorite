import { Suspense, type ReactNode } from "react";
import { AppShell, ShellSkeleton } from "@/components/app-shell/app-shell";
import { BrowserOnly } from "@/components/browser-only";

// Signed-in studio screens are rendered in the browser from the authorized API, so navigations
// into them are allowed to wait for that data (opts this area out of instant-UI validation).
export const instant = false;

/** Studio screens render in the browser only; their data always comes from the authorized API. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <BrowserOnly reason="Studio screens load private data from the API after sign-in.">
        <AppShell>{children}</AppShell>
      </BrowserOnly>
    </Suspense>
  );
}
