import Image from "next/image";
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
import { cn } from "@/lib/utils";
import { photos, type Photo } from "@/assets/images";

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
        <section className="overflow-hidden bg-gradient-to-b from-blue-tint/70 to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
            <div className="space-y-6">
              <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[#c9dcff] bg-white px-3 py-1 text-xs font-medium text-blue-ink">
                For tailors and fashion designers in Nigeria
              </p>
              <h1 className="animate-fade-up text-4xl font-bold tracking-tight text-balance sm:text-5xl" style={{ ["--i" as string]: 1 }}>
                Every detail agreed. Every stitch understood.
              </h1>
              <p className="animate-fade-up max-w-xl text-lg text-[#3d4757]" style={{ ["--i" as string]: 2 }}>
                Tailorite turns a customer&apos;s messages, reference pictures and voice notes into a clear brief they approve on their phone —
                before you cut the fabric. When something changes later, they see exactly what changes and what it costs.
              </p>
              <div className="animate-fade-up flex flex-wrap gap-3" style={{ ["--i" as string]: 3 }}>
                <Button asChild size="lg" className="group h-12 px-5 text-base">
                  <Link href="/register">
                    Create your first order <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 bg-white px-5 text-base">
                  <Link href="/demo">Explore demo</Link>
                </Button>
              </div>
              <p className="animate-fade-up text-sm text-muted-foreground" style={{ ["--i" as string]: 4 }}>
                Free while in beta. The demo uses a private sandbox with synthetic data — no sign-up needed.
              </p>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section
          aria-labelledby="problem"
          className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14 lg:pt-12 lg:pb-20"
        >
          <div>
            <h2 id="problem" className="reveal max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Most tailoring disputes start with a misunderstanding, not bad work.
            </h2>
            <div className="mt-8 grid gap-4">
              {PROBLEMS.map((p) => (
                <div key={p.title} className="reveal hover-lift flex gap-4 rounded-xl border border-border bg-white p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-coral-tint">
                    <p.icon className="size-5 text-coral-ink" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{p.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <PhotoCard photo={photos.fabricRolls} className="reveal aspect-[4/3] lg:aspect-square" sizes="(min-width: 1024px) 480px, 100vw" />
        </section>

        <section id="how" aria-labelledby="how-title" className="scroll-mt-16 bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how-title" className="reveal text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="reveal hover-lift rounded-xl border border-border bg-white p-5">
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

        <section
          aria-labelledby="trust"
          className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-14 lg:py-24"
        >
          <PhotoCard
            photo={photos.tailorSmiling}
            className="reveal hidden lg:block"
            imageClassName="object-[50%_30%]"
            sizes="(min-width: 1024px) 400px, 1px"
          />
          <div>
            <h2 id="trust" className="reveal text-2xl font-semibold tracking-tight sm:text-3xl">
              Built to be trusted by both sides
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {TRUST.map((t) => (
                <div key={t.title} className="reveal hover-lift rounded-xl border border-border bg-white p-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-teal-tint">
                    <t.icon className="size-5 text-teal-ink" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-semibold">{t.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
                </div>
              ))}
            </div>
            <p className="reveal mt-6 max-w-3xl text-sm text-muted-foreground">
            Honest limits: Tailorite records payments your studio receives but does not process them. The customer&apos;s typed name is
            recorded with their approval; it is not a verified identity or legal signature. AI suggestions can be wrong, which is why every one
            needs your review.
            </p>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-16 bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center">
            <div className="reveal space-y-3">
              <h2 id="pricing-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Free during the beta
              </h2>
              <p className="text-[#3d4757]">
                We are still testing what a fair price looks like. Billing is not active: you will not be charged, and no part of your work is
                locked.
              </p>
            </div>
            <div className="reveal rounded-2xl border border-[#c9dcff] bg-white p-6 shadow-[0_20px_50px_-35px_rgb(6_102_255/0.5)]">
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

        <section className="px-4 py-16 sm:px-6">
          <div className="reveal relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0b1b33] text-white">
            <div className="absolute inset-y-0 right-0 -z-10 w-full md:w-[55%]">
              <Image
                src={photos.ankaraPortraitDark.src}
                alt=""
                fill
                placeholder="blur"
                sizes="(min-width: 768px) 640px, 100vw"
                className="object-cover object-[50%_22%]"
              />
            </div>
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b1b33] via-[#0b1b33]/85 to-[#0b1b33]/50 md:bg-gradient-to-r md:from-[#0b1b33] md:from-40% md:via-[#0b1b33]/75 md:via-60% md:to-transparent" />
            <div className="max-w-xl space-y-6 px-6 py-14 sm:px-10 md:py-20">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Start your next order with everything agreed.</h2>
              <p className="text-white/80">
                One shared record of the design, price, deposit and delivery date — approved by your customer before the first cut.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="group h-12 bg-white px-5 text-base text-[#0b1b33] hover:bg-white/90">
                  <Link href="/register">
                    Create your first order <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/30 bg-white/10 px-5 text-base text-white backdrop-blur hover:bg-white/20 hover:text-white"
                >
                  <Link href="/demo">Explore demo</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span className="inline-flex items-center gap-2">
            <Logo className="scale-90" /> <span className="hidden sm:inline">· Beta</span>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Create an account
            </Link>
            <Link href="/demo" className="hover:text-foreground">
              Demo
            </Link>
            <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              Photos: Pexels
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Studio photo with the customer review screen floating over it. */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none lg:pb-6">
      <div className="animate-scale-in relative aspect-[4/3] overflow-hidden rounded-3xl bg-[#0b1b33] shadow-[0_30px_60px_-30px_rgb(11_27_51/0.55)] sm:aspect-[5/4] lg:ml-auto lg:aspect-[4/5] lg:w-[78%]">
        <Image
          src={photos.designerAnkara.src}
          alt={photos.designerAnkara.alt}
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 448px, 100vw"
          className="animate-drift object-cover object-[50%_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1b33]/30 via-transparent to-transparent" />
      </div>
      <div
        className="animate-fade-up relative -mt-24 sm:-mt-32 lg:absolute lg:bottom-0 lg:left-0 lg:mt-0 lg:w-[340px]"
        style={{ ["--i" as string]: 4 }}
      >
        <div className="animate-float [zoom:0.9] lg:[zoom:0.8]">
          <ReviewPreview />
        </div>
      </div>
    </div>
  );
}

function PhotoCard({
  photo,
  className,
  imageClassName,
  sizes,
}: {
  photo: Photo;
  className?: string;
  imageClassName?: string;
  sizes: string;
}) {
  return (
    <div className={cn("relative min-h-64 overflow-hidden rounded-3xl bg-[#0b1b33]", className)}>
      <Image src={photo.src} alt={photo.alt} fill placeholder="blur" sizes={sizes} className={cn("object-cover", imageClassName)} />
    </div>
  );
}
