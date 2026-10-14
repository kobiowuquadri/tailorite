import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  FileStack,
  GitCompareArrows,
  History,
  Link2,
  MessageSquareWarning,
  Mic,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ReviewPreview } from "@/components/marketing/review-preview";
import { PRICING_HYPOTHESIS } from "@/contracts/studio";
import { formatKobo } from "@/lib/format";

export const metadata: Metadata = {
  title: { absolute: "Tailorite — Every detail agreed. Every stitch understood." },
};

const STEPS = [
  {
    icon: FileStack,
    title: "Collect what the customer sent",
    body: "Paste WhatsApp messages, upload reference pictures and voice notes, or record one. Everything stays private to your studio.",
  },
  {
    icon: ScanSearch,
    title: "Turn it into a clear brief",
    body: "Optional AI drafts the details and links each one to the message, picture or recording it came from. Conflicts are shown, never silently picked. You confirm price and dates.",
  },
  {
    icon: BadgeCheck,
    title: "Get approval before the first cut",
    body: "Send a private link. The customer checks the exact version on their phone and approves it — or asks for changes. Later changes become new versions with the price and date difference.",
  },
];

const PROBLEMS = [
  {
    icon: MessageSquareWarning,
    title: "Details are scattered",
    body: "Instructions arrive across chats, pictures and voice notes over several days. The latest word is easy to miss.",
  },
  {
    icon: GitCompareArrows,
    title: "Instructions contradict",
    body: "“Long and fitted sleeves” in one message, “elbow length” in a later voice note. Which one did the customer finally want?",
  },
  {
    icon: Wallet,
    title: "Changes become arguments",
    body: "An extra request changes the price or delivery date, but nobody wrote down what was agreed before or after.",
  },
];

const TRUST = [
  { icon: Sparkles, title: "AI suggests, you decide", body: "Nothing enters the brief until someone in your studio accepts it. Manual mode works without any AI." },
  { icon: Link2, title: "Every detail has a source", body: "Each suggested detail points to the exact message, picture or moment in a voice note." },
  { icon: ShieldCheck, title: "An exact, frozen version", body: "What the customer approves cannot be edited afterwards. Changes need a new version and a new approval." },
  { icon: History, title: "History that stays", body: "Earlier versions, decisions and payment entries are kept. Corrections are added, never overwritten." },
];

export default function LandingPage() {
  const price = formatKobo(PRICING_HYPOTHESIS.proposedPricePerApprovedOrderKobo);
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/90 backdrop-blur supports-backdrop-filter:bg-white/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Tailorite home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="hidden rounded-md px-3 py-2 text-sm font-medium text-[#3d4757] hover:text-foreground sm:inline">
              How it works
            </a>
            <a href="#pricing" className="hidden rounded-md px-3 py-2 text-sm font-medium text-[#3d4757] hover:text-foreground sm:inline">
              Pricing
            </a>
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/register">Create your first order</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-gradient-to-b from-blue-tint/70 to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-20">
            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#c9dcff] bg-white px-3 py-1 text-xs font-medium text-blue-ink">
                For tailors and fashion designers in Nigeria
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">Every detail agreed. Every stitch understood.</h1>
              <p className="max-w-xl text-lg text-[#3d4757]">
                Tailorite turns a customer&apos;s messages, reference pictures and voice notes into a clear brief they approve on their phone —
                before you cut the fabric. When something changes later, they see exactly what changes and what it costs.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 px-5 text-base">
                  <Link href="/register">
                    Create your first order <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 bg-white px-5 text-base">
                  <Link href="/demo">Explore demo</Link>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Free while in beta. The demo uses a private sandbox with synthetic data — no sign-up needed.
              </p>
            </div>
            <ReviewPreview />
          </div>
        </section>

        <section aria-labelledby="problem" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="problem" className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Most tailoring disputes start with a misunderstanding, not bad work.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="rounded-xl border border-border bg-white p-5">
                <p.icon className="size-5 text-coral-ink" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="scroll-mt-16 bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-border bg-white p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <s.icon className="size-5 text-blue-ink" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Mic className="size-4" aria-hidden="true" /> Voice notes are transcribed with timestamps, so you can jump to the exact moment a
              detail was said.
            </p>
          </div>
        </section>

        <section aria-labelledby="trust" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="trust" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Built to be trusted by both sides
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-xl border border-border p-5">
                <t.icon className="size-5 text-teal-ink" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
            Honest limits: Tailorite records payments your studio receives but does not process them. The customer&apos;s typed name is
            recorded with their approval; it is not a verified identity or legal signature. AI suggestions can be wrong, which is why every one
            needs your review.
          </p>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-16 bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center">
            <div className="space-y-3">
              <h2 id="pricing-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Free during the beta
              </h2>
              <p className="text-[#3d4757]">
                We are still testing what a fair price looks like. Billing is not active: you will not be charged, and no part of your work is
                locked.
              </p>
            </div>
            <div className="rounded-2xl border border-[#c9dcff] bg-white p-6">
              <p className="text-sm font-medium text-blue-ink">Proposed pricing — a hypothesis we are testing</p>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {price} <span className="text-base font-medium text-muted-foreground">per newly approved order</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-[#3d4757]">
                <li>First {PRICING_HYPOTHESIS.freeApprovedOrders} approved orders free</li>
                <li>Revisions and change approvals included</li>
                <li>Drafts, customers and measurements are never charged</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Start your next order with everything agreed.</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-5 text-base">
              <Link href="/register">
                Create your first order <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-5 text-base">
              <Link href="/demo">Explore demo</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span className="inline-flex items-center gap-2">
            <Logo className="scale-90" /> <span className="hidden sm:inline">· Beta</span>
          </span>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Create an account
            </Link>
            <Link href="/demo" className="hover:text-foreground">
              Demo
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
