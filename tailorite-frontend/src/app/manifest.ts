import type { MetadataRoute } from "next";

/** Lets studios add Tailorite to their phone's home screen. Icons live in public/icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tailorite",
    short_name: "Tailorite",
    description: "Customer-approved tailoring briefs from messages, pictures and voice notes.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#0666ff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
