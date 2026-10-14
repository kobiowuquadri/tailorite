import { Suspense } from "react";
import type { Metadata } from "next";
import { BrowserOnly } from "@/components/browser-only";
import { PortalSkeleton, PortalView } from "@/components/portal/portal-view";

export const metadata: Metadata = {
  title: "Review your outfit details",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Customer review link: /review/{accessId}#{token}. No account; the link itself grants access. */
export default function ReviewPage() {
  return (
    <Suspense fallback={<PortalSkeleton />}>
      <BrowserOnly reason="The review token is in the URL fragment, which only the browser can read.">
        <PortalView />
      </BrowserOnly>
    </Suspense>
  );
}
