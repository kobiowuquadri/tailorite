import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="64" height="64" rx="14" fill="#0666FF" />
      <path
        d="M16 31.5 27 42 48 20"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 52h36" fill="none" stroke="#00BFB3" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="5 4.5" />
    </svg>
  );
}

/** Text wordmark (no brand asset files were supplied for this release). */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <span className="text-lg font-bold tracking-tight text-foreground">Tailorite</span>
    </span>
  );
}
