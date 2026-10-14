import { cacheLife } from "next/cache";

// Reading the clock during prerendering is not allowed; a cached value refreshed daily is accurate enough for a year.
async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function Copyright({ className }: { className?: string }) {
  const year = await currentYear();
  return <p className={className}>© {year} Tailorite. All rights reserved.</p>;
}
