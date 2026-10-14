import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const description =
  "Tailorite turns reference pictures, voice notes and scattered messages into clear, customer-approved tailoring orders before the first stitch.";

// Absolute base for share images. On Vercel, Next.js falls back to the production URL; set SITE_URL for a custom domain.
const siteUrl = process.env.SITE_URL?.trim();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: "Tailorite — Every detail agreed. Every stitch understood.",
    template: "%s · Tailorite",
  },
  description,
  applicationName: "Tailorite",
  appleWebApp: { title: "Tailorite", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "Tailorite",
    locale: "en_US",
    title: "Tailorite — Every detail agreed. Every stitch understood.",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Tailorite — Every detail agreed. Every stitch understood.",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#0666ff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
