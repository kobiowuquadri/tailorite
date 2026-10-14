"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  FlaskConical,
  ListChecks,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DemoGuide } from "@/components/demo/demo-guide";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/states";
import { api, isApiError } from "@/lib/api";
import { useSession } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { SessionDto } from "@/contracts/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-blue-tint text-blue-ink" : "text-[#3d4757] hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountBlock({ session }: { session: SessionDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  }
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="min-w-0 px-1">
        <p className="truncate text-sm font-medium text-foreground">{session.studio?.name}</p>
        <p className="truncate text-xs text-muted-foreground">{session.user.name}</p>
      </div>
      <Button variant="ghost" className="w-full justify-start" onClick={signOut} disabled={busy}>
        <LogOut /> Sign out
      </Button>
    </div>
  );
}

function DemoBanner({ sandbox }: { sandbox: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#f6dfa3] bg-amber-tint px-4 py-2 text-sm text-amber-ink">
      <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
      {sandbox ? (
        <p className="min-w-0 flex-1">
          You are exploring a demo studio with <strong>synthetic data</strong>. Your changes stay in this private sandbox
          and are deleted automatically.
        </p>
      ) : (
        <p className="min-w-0 flex-1">
          Demo studio with <strong>synthetic data</strong> — every customer and order here is fictional.
        </p>
      )}
      <Sheet>
        <SheetTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 border-[#f6dfa3] bg-white text-amber-ink hover:bg-white/80">
            <ListChecks /> How to test
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>How to test Tailorite</SheetTitle>
            <SheetDescription>
              About 5 minutes. You play the tailor here and the customer in a private window or on your phone.
            </SheetDescription>
          </SheetHeader>
          <DemoGuide compact className="px-4 pb-6" />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-white p-4 lg:block">
        <Logo />
        <div className="mt-8 space-y-2">
          {NAV.map((n) => (
            <Skeleton key={n.href} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-32 w-full" />
      </main>
    </div>
  );
}

/** Signed-in layout. The API is the authority; this gate only routes people to the right screen. */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const unauthenticated = isApiError(session.error, "UNAUTHENTICATED");
  const needsOnboarding = Boolean(session.data && !session.data.studio);

  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (needsOnboarding) router.replace("/onboarding");
  }, [unauthenticated, needsOnboarding, pathname, router]);

  if (session.isPending || unauthenticated || needsOnboarding) return <ShellSkeleton />;
  if (session.error || !session.data) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState error={session.error} onRetry={() => session.refetch()} />
      </div>
    );
  }
  const data = session.data;
  const isDemo = data.user.isDemo || data.studio?.isDemo;

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-border bg-white p-4 lg:flex">
        <div className="space-y-8">
          <Link href="/dashboard" className="block px-1" aria-label="Tailorite dashboard">
            <Logo />
          </Link>
          <Button asChild className="w-full">
            <Link href="/orders/new">
              <Plus /> New order
            </Link>
          </Button>
          <NavLinks />
        </div>
        <AccountBlock session={data} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo ? <DemoBanner sandbox={Boolean(data.studio?.demoExpiresAt)} /> : null}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/dashboard" aria-label="Tailorite dashboard">
            <Logo className="h-6" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/orders/new">
                <Plus /> New order
              </Link>
            </Button>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-72 flex-col justify-between p-4">
                <div className="space-y-6">
                  <SheetHeader className="p-0">
                    <SheetTitle>
                      <Logo />
                    </SheetTitle>
                  </SheetHeader>
                  <NavLinks onNavigate={() => setMenuOpen(false)} />
                </div>
                <AccountBlock session={data} />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main id="main" className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 2xl:px-12">
          {children}
        </main>
      </div>
    </div>
  );
}
