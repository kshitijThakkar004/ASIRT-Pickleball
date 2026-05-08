"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Radio } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Standings" },
  { href: "/knockout", label: "Knockout" },
  { href: "/history", label: "Previous" },
  { href: "/play", label: "Where To Play" }
] as const;

export function PublicShell({
  title,
  liveCount,
  children
}: {
  title: string;
  liveCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="standings-shell">
      <div className="standings-app">
        <header className="standings-topbar">
          <Link className="icon-button" href="/admin" aria-label="Open admin console">
            <ChevronLeft size={20} />
          </Link>
          <h1>{title}</h1>
          <div className="live-count" aria-label={`${liveCount} live matches`}>
            <Radio size={13} />
            <span>{liveCount}</span>
          </div>
        </header>

        <nav className="public-nav" aria-label="Public tournament pages">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              className={pathname === item.href ? "public-nav-tab is-active" : "public-nav-tab"}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </main>
  );
}
