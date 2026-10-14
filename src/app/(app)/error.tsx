"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Unexpected rendering errors inside the studio screens. Data errors are handled on each page. */
export default function StudioError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-[#f6c7c2] bg-[#fff8f7] p-6">
      <p className="flex items-center gap-2 font-semibold text-[#b42318]">
        <AlertTriangle className="size-4" aria-hidden="true" /> Something went wrong on this screen
      </p>
      <p className="text-sm">Your saved work is safe. Try again, or go back to the dashboard.</p>
      {error.digest ? <p className="text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>
          <RefreshCw /> Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
