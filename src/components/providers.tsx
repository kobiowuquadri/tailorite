"use client";

import type { ReactNode } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { installZodErrorMessages } from "@/contracts/common";

installZodErrorMessages();

const APP_PREFIXES = ["/dashboard", "/orders", "/customers", "/settings", "/onboarding", "/print"];

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // An expired owner session anywhere in the app sends the person back to sign in.
        if (
          error instanceof ApiError &&
          error.code === "UNAUTHENTICATED" &&
          typeof window !== "undefined" &&
          APP_PREFIXES.some((p) => window.location.pathname.startsWith(p))
        ) {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          // A full page load (not a client navigation) also drops every cached query of the old session.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`/login?next=${next}&expired=1`);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

function getQueryClient() {
  // Keep server renders isolated and reuse one client in the browser.
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
