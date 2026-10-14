"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export type PrintStudio = { name: string; phone: string | null; email: string | null; city: string | null };

/** A4 "paper" with a screen-only toolbar. The browser's Print dialog offers Save as PDF. */
export function PrintDocument({
  backHref,
  backLabel,
  studio,
  documentTitle,
  identifiers,
  stamp,
  children,
  footer,
  watermark,
}: {
  backHref: string;
  backLabel: string;
  studio: PrintStudio;
  documentTitle: string;
  identifiers: { label: string; value: string }[];
  stamp: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  watermark?: string;
}) {
  return (
    <div className="mx-auto max-w-[210mm] px-4 py-6 print:max-w-none print:p-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft /> {backLabel}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs text-muted-foreground sm:block">Choose “Save as PDF” in the print dialog to keep a copy.</p>
          <Button onClick={() => window.print()}>
            <Printer /> Print / save PDF
          </Button>
        </div>
      </div>

      <article className="relative overflow-hidden rounded-xl border border-border bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {watermark ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-30 text-7xl font-black tracking-widest whitespace-nowrap text-[#b42318]/10 uppercase select-none">
              {watermark}
            </span>
          </div>
        ) : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <p className="text-xl font-bold tracking-tight">{studio.name}</p>
            <p className="text-sm text-muted-foreground">{[studio.city, studio.phone, studio.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-lg font-semibold">{documentTitle}</p>
            <dl className="grid grid-cols-[auto_auto] justify-end gap-x-3 text-sm">
              {identifiers.map((i) => (
                <div key={i.label} className="contents">
                  <dt className="text-muted-foreground">{i.label}</dt>
                  <dd className="font-medium tabular">{i.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>
        <div className="mt-5">{stamp}</div>
        <div className="relative mt-6">{children}</div>
        <footer className={cn("mt-8 flex items-end justify-between gap-4 border-t border-border pt-4 text-xs text-muted-foreground")}>
          <div className="space-y-1">{footer}</div>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <LogoMark className="size-4" /> Prepared with Tailorite
          </span>
        </footer>
      </article>
    </div>
  );
}
