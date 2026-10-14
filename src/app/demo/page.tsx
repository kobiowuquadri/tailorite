"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { DemoSessionDto } from "@/contracts/timeline";

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
        <div className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
          <div className="space-y-2">
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
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
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
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-12 px-5 text-base" onClick={start} disabled={busy}>
              {busy ? <Spinner /> : null} Start the demo <ArrowRight />
            </Button>
            <Button asChild variant="ghost">
              <Link href="/register">Create a real studio instead</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: open a customer review link from the demo in a private window or on your phone to see the approval screen as a customer would.
          </p>
        </div>
      </main>
    </div>
  );
}
