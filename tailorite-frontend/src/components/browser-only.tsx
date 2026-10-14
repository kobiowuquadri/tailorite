"use client";

import { use, type ReactNode } from "react";
import { browser } from "react-dom";

/**
 * Renders children only in the browser. During prerendering this suspends to the nearest
 * <Suspense> boundary, whose fallback becomes the static HTML. Used for signed-in screens and
 * the customer portal, which always load private data from the API after hydration.
 */
export function BrowserOnly({ children, reason }: { children: ReactNode; reason: string }) {
  use(browser(reason));
  return <>{children}</>;
}
