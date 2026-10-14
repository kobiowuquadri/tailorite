import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Tailorite — Every detail agreed. Every stitch understood.",
    template: "%s · Tailorite",
  },
  description:
    "Tailorite turns reference pictures, voice notes and scattered messages into clear, customer-approved tailoring orders before the first stitch.",
  applicationName: "Tailorite",
};

export const viewport: Viewport = {
  themeColor: "#0666ff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
