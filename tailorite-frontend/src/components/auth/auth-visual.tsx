"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, GitCompareArrows, Link2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { photos, type Photo } from "@/assets/images";
import { cn } from "@/lib/utils";

/** `position` frames the tall desktop panel; `bannerPosition` frames the short strip shown on phones. */
type Scene = { photo: Photo; title: string; body: string; position: string; bannerPosition: string };

const SCENES: Record<string, Scene> = {
  login: {
    photo: photos.ankaraPortraitPink,
    title: "Welcome back to your studio.",
    body: "Every detail agreed. Every stitch understood.",
    position: "object-[50%_25%]",
    bannerPosition: "object-[50%_22%]",
  },
  register: {
    photo: photos.tailorMeasuring,
    title: "Agree every detail before the first cut.",
    body: "Turn customers’ messages, pictures and voice notes into a brief they approve on their phone.",
    position: "object-[50%_30%]",
    bannerPosition: "object-[50%_50%]",
  },
  onboarding: {
    photo: photos.measuringTape,
    title: "Set up your studio in a minute.",
    body: "Your studio name and contact details appear on the briefs your customers review.",
    position: "object-center",
    bannerPosition: "object-center",
  },
};

const POINTS = [
  {
    icon: Link2,
    text: "Every detail linked to the message, picture or voice note it came from",
  },
  {
    icon: BadgeCheck,
    text: "Customers approve an exact version on their phone",
  },
  {
    icon: GitCompareArrows,
    text: "Changes show the price and date difference before anyone agrees",
  },
];

function sceneFor(pathname: string): Scene {
  if (pathname.startsWith("/register")) return SCENES.register;
  if (pathname.startsWith("/onboarding")) return SCENES.onboarding;
  return SCENES.login;
}

/** Large photo panel beside the sign-in forms (desktop) and a short banner above them (phones). */
export function AuthVisual({ variant }: { variant: "panel" | "banner" }) {
  const scene = sceneFor(usePathname() ?? "/login");

  if (variant === "banner") {
    return (
      <div className="relative h-44 overflow-hidden lg:hidden">
        <Image
          src={scene.photo.src}
          alt=""
          fill
          fetchPriority="high"
          sizes="(min-width: 1024px) 1px, 100vw"
          placeholder="blur"
          className={cn("animate-drift object-cover", scene.bannerPosition)}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1b33]/70 via-[#0b1b33]/35 to-canvas" />
        <Link href="/" aria-label="Tailorite home" className="absolute top-5 left-4 sm:left-8">
          <Logo light />
        </Link>
      </div>
    );
  }

  return (
    <aside className="relative hidden overflow-hidden bg-[#0b1b33] lg:block" aria-label="Tailorite">
      <Image
        src={scene.photo.src}
        alt={scene.photo.alt}
        fill
        fetchPriority="high"
        sizes="(min-width: 1024px) 52vw, 100vw"
        placeholder="blur"
        className={cn("animate-drift object-cover", scene.position)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b1b33]/95 via-[#0b1b33]/40 to-[#0b1b33]/20" />
      <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
        <Link href="/" aria-label="Tailorite home" className="animate-fade-in w-fit">
          <Logo light />
        </Link>
        <div className="max-w-lg space-y-6 text-white">
          <div className="space-y-3">
            <h2
              className="animate-fade-up text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl"
              style={{ ["--i" as string]: 1 }}
            >
              {scene.title}
            </h2>
            <p className="animate-fade-up text-base text-white/80" style={{ ["--i" as string]: 2 }}>
              {scene.body}
            </p>
          </div>
          <ul className="space-y-2.5">
            {POINTS.map(({ icon: Icon, text }, i) => (
              <li key={text} className="animate-fade-up flex items-start gap-3 text-sm text-white/90" style={{ ["--i" as string]: i + 3 }}>
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
