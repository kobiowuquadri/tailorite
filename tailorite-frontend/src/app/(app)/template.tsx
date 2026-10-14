import type { ReactNode } from "react";

/** Templates remount on navigation between studio sections, so each screen eases in. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
