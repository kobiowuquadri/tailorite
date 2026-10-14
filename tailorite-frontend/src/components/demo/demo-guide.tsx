import { cn } from "@/lib/utils";

/** What a tester can do in a demo sandbox, in order. Mirrors the synthetic "Amina Atelier" scenario. */
export const DEMO_STEPS: { title: string; body: string }[] = [
  {
    title: "Turn Ada's messages into a brief",
    body: "The demo opens Ada Okafor's navy evening dress order. In the Example draft panel, choose “Load example results”. Click any source chip to jump to the message, picture or moment in the voice note it came from.",
  },
  {
    title: "Settle the sleeve conflict",
    body: "The message says long, fitted sleeves; the voice note says elbow length. Resolve it with “Elbow length”, answer the fit and fabric questions, and accept the other suggestions.",
  },
  {
    title: "Share it for approval",
    body: "Tick the reference picture, check $850 price, $300 deposit and the delivery date, then “Share for review” and copy the link.",
  },
  {
    title: "Approve as the customer",
    body: "Open the link in a private/incognito window or on your phone. Type “Ada Okafor”, tick the confirmation and approve version 1.",
  },
  {
    title: "Record the deposit",
    body: "On the order page, “Record payment” → deposit $300. The balance becomes $550. Try “Print / PDF”.",
  },
  {
    title: "Ask for a change as the customer",
    body: "“Send a change-request link”, open it in the private window and ask for heavier beading on the neckline.",
  },
  {
    title: "Price the change",
    body: "“Prepare a proposal”: embellishments “Heavier beading around the neckline”, price $1,000, delivery 2 days later → “Share change for approval”. Version 1 stays the agreement meanwhile.",
  },
  {
    title: "Approve the change",
    body: "Open the new link: it shows $850 → $1,000 (+$150) and the new date. Approve it. The order now shows version 2 in force, balance $700, and version 1 kept in history.",
  },
];

export const DEMO_FACTS: { label: string; value: string }[] = [
  { label: "Studio", value: "Amina Atelier (fictional)" },
  { label: "Customer", value: "Ada Okafor (fictional)" },
  { label: "Order", value: "ORD-0001 · Navy evening dress" },
  { label: "Version 1", value: "$850 · deposit $300" },
  { label: "Change", value: "+$150 → $1,000 · delivery +2 days" },
  { label: "Balance", value: "$550 after deposit · $700 after the change" },
  { label: "AI", value: "Prepared example results, labelled as such" },
];

export function DemoGuide({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("space-y-5", className)}>
      <ol className="space-y-3">
        {DEMO_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-tint text-xs font-semibold text-blue-ink"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-xl bg-canvas p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Demo data at a glance</p>
        <dl className={cn("grid gap-x-4 gap-y-1.5 text-sm", compact ? "grid-cols-1" : "sm:grid-cols-[auto_1fr]")}>
          {DEMO_FACTS.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-xs text-muted-foreground">
        Other orders in the dashboard show the remaining states: ready to share, awaiting approval, a customer change request, in
        production and completed. Everything is synthetic and stays in your private sandbox.
      </p>
    </div>
  );
}
