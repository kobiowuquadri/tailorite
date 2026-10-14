import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CirclePlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { photos } from "@/assets/images";

const REASSURANCE = ["Free during the beta", "No card required", "Demo needs no sign-up"];

/** Landing hero: the promise on the left, a studio photo on the right. */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Soft brand light: blue from the top right, teal from the bottom left. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_88%_0%,rgb(6_102_255/0.10),transparent_70%),radial-gradient(45%_55%_at_0%_100%,rgb(0_191_179/0.10),transparent_70%)]"
      />
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pt-16 lg:pb-24">
        <div className="lg:col-span-6">
          <p className="animate-fade-up inline-flex items-center gap-2.5 rounded-full border border-border bg-white/80 py-1 pr-3.5 pl-2 text-xs font-medium text-[#3d4757] shadow-xs backdrop-blur">
            <span className="flex gap-1" aria-hidden="true">
              <span className="size-1.5 rounded-full bg-brand-blue" />
              <span className="size-1.5 rounded-full bg-brand-teal" />
              <span className="size-1.5 rounded-full bg-brand-coral" />
              <span className="size-1.5 rounded-full bg-brand-amber" />
            </span>
            Built for independent tailors and fashion designers
          </p>

          <h1
            className="animate-fade-up mt-6 text-[2.6rem] leading-[1.06] font-bold tracking-[-0.035em] text-foreground sm:text-6xl lg:text-[3.2rem] xl:text-[3.7rem]"
            style={{ ["--i" as string]: 1 }}
          >
            Every detail <span className="text-primary">agreed.</span>
            <br />
            Every stitch{" "}
            <span className="relative inline-block whitespace-nowrap">
              understood.
              <svg
                aria-hidden="true"
                viewBox="0 0 320 28"
                preserveAspectRatio="none"
                className="absolute -bottom-[0.18em] left-0 h-[0.3em] w-full text-brand-teal"
              >
                <path
                  d="M6 18 C 70 4, 120 6, 170 16 S 270 28, 314 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="7"
                  strokeLinecap="round"
                  pathLength={1}
                  className="animate-draw"
                  style={{ ["--i" as string]: 6 }}
                />
              </svg>
            </span>
          </h1>

          <p className="animate-fade-up mt-7 max-w-xl text-lg leading-relaxed text-[#3d4757] sm:text-xl" style={{ ["--i" as string]: 2 }}>
            Turn a customer&apos;s messages, reference pictures and voice notes into one clear brief they approve on their phone —
            before you cut the fabric.
          </p>

          <div className="animate-fade-up mt-9 flex flex-col gap-3 sm:flex-row" style={{ ["--i" as string]: 3 }}>
            <Button asChild size="lg" className="group h-12 px-6 text-base shadow-[0_10px_24px_-10px_rgb(6_102_255/0.6)]">
              <Link href="/register">
                Create your first order
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 bg-white px-6 text-base">
              <Link href="/demo">
                <CirclePlay /> Try the live demo
              </Link>
            </Button>
          </div>

          <ul className="animate-fade-up mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" style={{ ["--i" as string]: 4 }}>
            {REASSURANCE.map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-teal-ink" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <HeroPhoto />
      </div>
    </section>
  );
}

/** Studio photo with a soft brand-gradient panel offset behind it. */
function HeroPhoto() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] pb-4 pl-4 sm:pb-6 sm:pl-6 lg:col-span-6 lg:max-w-none">
      <div className="relative lg:ml-auto lg:w-[86%]">
        <div
          aria-hidden="true"
          className="animate-fade-in absolute -bottom-4 -left-4 h-[88%] w-[88%] rounded-[2rem] bg-[linear-gradient(135deg,rgb(6_102_255/0.16),rgb(0_191_179/0.22))] sm:-bottom-6 sm:-left-6"
          style={{ ["--i" as string]: 3 }}
        />
        <div className="animate-scale-in relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-[#0b1b33] shadow-[0_40px_80px_-40px_rgb(11_27_51/0.6)]">
          <Image
            src={photos.designerAnkara.src}
            alt={photos.designerAnkara.alt}
            fill
            preload
            placeholder="blur"
            sizes="(min-width: 1280px) 540px, (min-width: 1024px) 440px, (min-width: 640px) 500px, 100vw"
            className="animate-drift object-cover object-[50%_28%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1b33]/35 via-transparent to-transparent" />
        </div>
      </div>
    </div>
  );
}
