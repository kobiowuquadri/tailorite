import Image from "next/image";
import mark from "@/assets/brand/tailorite-mark.png";
import wordmark from "@/assets/brand/tailorite-wordmark.png";
import wordmarkLight from "@/assets/brand/tailorite-wordmark-light.png";
import { cn } from "@/lib/utils";

// Brand files are derived from the masters in src/assets/images (Tailorite.png, Tailorite_favicon.png).
// They are pre-sized for 2–3x screens, so they are served as-is rather than through the image optimizer.

/** The "T" mark with the thread swoosh. Decorative: always pair it with visible text. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src={mark} alt="" aria-hidden="true" unoptimized className={cn("size-8 shrink-0 object-contain", className)} />;
}

/** Tailorite wordmark. `light` is the reversed version for dark backgrounds and photos. */
export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <Image
      src={light ? wordmarkLight : wordmark}
      alt="Tailorite"
      unoptimized
      loading="eager"
      className={cn("h-7 w-auto shrink-0 select-none", className)}
      draggable={false}
    />
  );
}
