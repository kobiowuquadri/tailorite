import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 text-center">
      <Logo />
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">We could not find that page</h1>
        <p className="text-muted-foreground">
          The address may be mistyped, or the page was moved. If a customer link brought you here, ask the studio to send it again.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/dashboard">Go to your dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Tailorite home</Link>
        </Button>
      </div>
    </main>
  );
}
