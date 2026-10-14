import { ArrowRight, BadgeCheck, CalendarClock, GitCompareArrows, Lock, MessageSquareText, Wallet } from "lucide-react";

/**
 * Static rendering of the customer review screen with the synthetic demo order. It mirrors the
 * real portal layout; the live version is available through "Explore demo".
 */
export function ReviewPreview() {
  return (
    <figure className="mx-auto w-full max-w-[340px]">
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-[#1d2433] bg-canvas shadow-xl">
        <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-6 items-center justify-center rounded-full bg-blue-tint text-xs font-bold text-blue-ink" aria-hidden="true">
              A
            </span>
            Amina Atelier
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-tint px-2 py-0.5 text-[10px] font-medium text-[#3d4757]">
            <Lock className="size-2.5" aria-hidden="true" /> Private review
          </span>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-base font-semibold">Hello Ada,</p>
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="text-sm font-semibold">Navy evening dress</p>
            <p className="text-[11px] text-muted-foreground">ORD-0001 · Version 2 (proposed change)</p>
          </div>
          <div className="space-y-2 rounded-xl border-2 border-[#ffcfc6] bg-white p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <GitCompareArrows className="size-3.5 text-coral-ink" aria-hidden="true" /> What is changing
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-border p-2">
                <p className="flex items-center gap-1 text-muted-foreground">
                  <Wallet className="size-3" aria-hidden="true" /> Total
                </p>
                <p className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground line-through">₦85,000</span>
                  <ArrowRight className="size-2.5 text-muted-foreground" aria-hidden="true" />
                  <span className="font-semibold">₦100,000</span>
                </p>
                <p className="font-medium text-coral-ink">+₦15,000</p>
              </div>
              <div className="rounded-lg border border-border p-2">
                <p className="flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="size-3" aria-hidden="true" /> Delivery
                </p>
                <p className="font-semibold">2 days later</p>
                <p className="text-muted-foreground">3 → 5 Nov</p>
              </div>
            </div>
            <div className="rounded-lg border border-border p-2 text-[11px]">
              <p className="font-medium">Embellishments</p>
              <p className="text-muted-foreground">Light beading around the neckline</p>
              <p className="font-semibold">Heavier beading around the neckline</p>
            </div>
          </div>
          <div className="space-y-1.5 pt-1">
            <span className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground">
              <BadgeCheck className="size-4" aria-hidden="true" /> Approve this version
            </span>
            <span className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white text-xs font-medium">
              <MessageSquareText className="size-3.5" aria-hidden="true" /> Request changes
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        The customer&apos;s review screen, shown with synthetic demo data.
      </figcaption>
    </figure>
  );
}
