import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Copyright } from "@/components/marketing/copyright";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/demo", label: "Live demo" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create an account" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] lg:px-8">
        <div className="max-w-sm space-y-3">
          <Link href="/" aria-label="Tailorite home" className="inline-block">
            <Logo />
          </Link>
          <p className="text-sm text-muted-foreground">
            Every detail agreed. Every stitch understood. Customer-approved briefs for tailors and fashion designers.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="space-y-3">
            <p className="text-sm font-semibold text-foreground">{column.title}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Copyright />
          <p>
            Photos:{" "}
            <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
              Pexels
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
