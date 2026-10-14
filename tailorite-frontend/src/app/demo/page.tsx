"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DemoGuide } from "@/components/demo/demo-guide";
import { api } from "@/lib/api";
import type { DemoSessionDto } from "@/contracts/timeline";
import { photos } from "@/assets/images";

const POINTS = [
  {
    icon: Users,
    title: "A synthetic studio",
    body: "“Amina Atelier” with fictional customers and six orders in different states: drafts, awaiting approval, approved, a change request and a completed order.",
  },
  {
    icon: Sparkles,
    title: "Labelled example results",
    body: "The demo uses prepared example results for its synthetic messages, picture and voice note. They are clearly labelled as examples, not a live AI call.",
  },
  {
    icon: ShieldCheck,
    title: "Private to you",
    body: "Each visitor gets an isolated sandbox. Nobody else sees your changes, and the sandbox is deleted automatically.",
  },
];

export default function DemoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { redirectTo } = await api<DemoSessionDto>("/demo/sessions", { method: "POST" });
      // Drop anything cached for a previous session before entering the sandbox.
      queryClient.clear();
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The demo could not be started. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="px-4 py-5 sm:px-8">
        <Link href="/" aria-label="Tailorite home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-6">
        <div className="animate-fade-up overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="relative h-40 overflow-hidden bg-[#0b1b33] sm:h-56">
            <Image
              src={photos.atelierFitting.src}
              alt=""
              fill
              priority
              placeholder="blur"
              sizes="(min-width: 768px) 768px, 100vw"
              className="animate-drift object-cover object-[50%_20%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent" />
          </div>
          <div className="-mt-6 space-y-6 p-6 pt-0 sm:p-8 sm:pt-0">
            <div className="relative space-y-2">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-tint px-2.5 py-1 text-xs font-medium text-amber-ink">
                <FlaskConical className="size-3.5" aria-hidden="true" /> Synthetic data only
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Explore Tailorite with a demo studio</h1>
              <p className="text-[#3d4757]">
                Walk through a real order: turn Ada&apos;s messages, reference picture and voice note into a brief, settle the sleeve conflict,
                share it for approval and handle a change request — all in the working product.
              </p>
            </div>
            <ul className="space-y-4">
              {POINTS.map((p, i) => (
                <li key={p.title} className="animate-fade-up flex gap-3" style={{ ["--i" as string]: i + 2 }}>
                  <p.icon className="mt-0.5 size-5 shrink-0 text-blue-ink" aria-hidden="true" />
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-sm text-muted-foreground">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="rounded-lg bg-[#fdecea] p-3 text-sm text-[#b42318]">
                {error}
              </p>
            ) : null}
            {busy ? (
              <p role="status" className="rounded-lg bg-blue-tint p-3 text-sm text-blue-ink">
                Setting up your private demo studio with six synthetic orders. On the free server this can take up to a minute — please
                keep this page open.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="h-12 px-5 text-base" onClick={start} disabled={busy}>
                {busy ? <Spinner /> : null} Start the demo <ArrowRight />
              </Button>
              <Button asChild variant="ghost">
                <Link href="/register">Create a real studio instead</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              No sign-up or password needed. If the page takes a moment to start, the free server is waking up — give it up to a minute.
            </p>
          </div>
        </div>

        <section
          aria-labelledby="test-steps"
          className="reveal mt-6 space-y-4 rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-1">
            <h2 id="test-steps" className="text-lg font-semibold">
              What to test (about 5 minutes)
            </h2>
            <p className="text-sm text-muted-foreground">
              The same steps are available inside the demo under “How to test”. You play both sides: the tailor in this window, the customer
              in a private window or on your phone.
            </p>
          </div>
          <DemoGuide />
          <Button size="lg" className="h-11" onClick={start} disabled={busy}>
            {busy ? <Spinner /> : null} Start the demo <ArrowRight />
          </Button>
        </section>
      </main>
    </div>
  );
}
