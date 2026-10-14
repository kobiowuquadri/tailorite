import type { StaticImageData } from "next/image";
import ankaraFabricRolls from "./ankara-fabric-rolls.webp";
import ankaraPortraitDark from "./ankara-portrait-dark.webp";
import ankaraPortraitPink from "./ankara-portrait-pink.webp";
import atelierFitting from "./atelier-fitting.webp";
import designerAnkaraSewing from "./designer-ankara-sewing.webp";
import designerStudio from "./designer-studio.webp";
import measuringTape from "./measuring-tape.webp";
import tailorMeasuringTape from "./tailor-measuring-tape.webp";
import tailorSmilingBw from "./tailor-smiling-bw.webp";
import tailorWorkshop from "./tailor-workshop.webp";

export type Photo = { src: StaticImageData; alt: string; source: string };

/** Stock photography (Pexels License — free to use). Sources are listed in CREDITS.md. */
export const photos = {
  designerAnkara: {
    src: designerAnkaraSewing,
    alt: "Fashion designer sewing vibrant African print fabric on a vintage sewing machine",
    source: "https://www.pexels.com/photo/38506009/",
  },
  ankaraPortraitPink: {
    src: ankaraPortraitPink,
    alt: "Woman in a tailored pink Ankara dress with matching headwrap",
    source: "https://www.pexels.com/photo/33939066/",
  },
  ankaraPortraitDark: {
    src: ankaraPortraitDark,
    alt: "Woman in a fitted African print gown with flared sleeves",
    source: "https://www.pexels.com/photo/38171942/",
  },
  tailorMeasuring: {
    src: tailorMeasuringTape,
    alt: "Tailor holding a measuring tape in a studio with dress forms",
    source: "https://www.pexels.com/photo/11513576/",
  },
  fabricRolls: {
    src: ankaraFabricRolls,
    alt: "Rows of colourful African print fabrics in a textile shop",
    source: "https://www.pexels.com/photo/38487458/",
  },
  tailorSmiling: {
    src: tailorSmilingBw,
    alt: "Smiling tailor at his sewing machine",
    source: "https://www.pexels.com/photo/37332553/",
  },
  atelierFitting: {
    src: atelierFitting,
    alt: "Designer fitting a garment on a client in a bright atelier",
    source: "https://www.pexels.com/photo/9853308/",
  },
  designerStudio: {
    src: designerStudio,
    alt: "Fashion designer arranging fabric in her studio",
    source: "https://www.pexels.com/photo/9849641/",
  },
  measuringTape: {
    src: measuringTape,
    alt: "Yellow measuring tape against dark fabric",
    source: "https://www.pexels.com/photo/6461399/",
  },
  tailorWorkshop: {
    src: tailorWorkshop,
    alt: "Tailor smiling at his sewing machine in a workshop",
    source: "https://www.pexels.com/photo/11645426/",
  },
} satisfies Record<string, Photo>;
