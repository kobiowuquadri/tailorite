import { Suspense, type ReactNode } from "react";
import { BrowserOnly } from "@/components/browser-only";

// Private, browser-rendered documents: navigations may wait for the authorized API.
export const instant = false;

/** Print views: no app navigation, A4-friendly paper, loaded from the authorized API in the browser. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Preparing the printable brief…</p>}>
      <BrowserOnly reason="Printable briefs load private data from the API after sign-in.">
        <main className="min-h-dvh bg-canvas print:bg-white">{children}</main>
      </BrowserOnly>
    </Suspense>
  );
}
