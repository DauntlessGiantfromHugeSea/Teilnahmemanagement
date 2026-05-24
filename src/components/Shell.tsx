import Link from "next/link";
import { Logo } from "./Logo";
import type { SessionPayload } from "@/lib/session";
import { Role } from "@prisma/client";

interface Props {
  session: SessionPayload;
  active?: string;
  children: React.ReactNode;
}

const PRIMARY = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "EDITOR", "ACCOUNTING", "VIEWER"] },
  { id: "events", href: "/events", label: "Veranstaltungen", roles: ["ADMIN", "EDITOR", "ACCOUNTING", "VIEWER"] },
  { id: "accounting", href: "/accounting", label: "Buchhaltung", roles: ["ADMIN", "ACCOUNTING"] },
];

const ADMIN = [
  { id: "users", href: "/admin/users", label: "Benutzer" },
  { id: "media", href: "/admin/media", label: "Media-Library" },
  { id: "audit", href: "/admin/audit", label: "Verlauf" },
  { id: "import", href: "/admin/import", label: "Import (CSV)" },
];

export function Shell({ session, active, children }: Props) {
  const nav = PRIMARY.filter((n) => n.roles.includes(session.role));
  const isAdmin = session.role === Role.ADMIN;
  const initials = session.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="topbar sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6">
          {/* Hamburger nur Mobile */}
          <details className="md:hidden relative shrink-0 group">
            <summary
              aria-label="Menü"
              className="list-none cursor-pointer h-10 w-10 -ml-2 flex items-center justify-center rounded-lg hover:bg-brand-50 active:bg-brand-100"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700 group-open:hidden">
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              </svg>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700 hidden group-open:block">
                <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
              </svg>
            </summary>
            {/* Backdrop + Slide-in Drawer */}
            <div className="fixed inset-x-0 top-[57px] bottom-0 bg-slate-900/30 backdrop-blur-sm z-40" aria-hidden />
            <div className="fixed left-0 top-[57px] bottom-0 w-72 max-w-[85vw] bg-white shadow-2xl z-50 overflow-y-auto">
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-brand-500 text-white text-sm font-semibold flex items-center justify-center">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{session.name}</div>
                    <div className="text-xs text-slate-500 truncate">{roleLabel(session.role)}</div>
                  </div>
                </div>
              </div>
              <nav className="p-2">
                {nav.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    className={
                      "block px-3 py-2.5 rounded-lg text-sm font-medium transition " +
                      (active === n.id
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-700 hover:bg-slate-100")
                    }
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="p-2 border-t border-slate-100">
                <Link href="/account" className="block px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">
                  Mein Konto
                </Link>
                <Link href="/hilfe" className="block px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">
                  Hilfe &amp; Anleitung
                </Link>
                {isAdmin && (
                  <>
                    <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                      Administration
                    </div>
                    {ADMIN.map((n) => (
                      <Link
                        key={n.id}
                        href={n.href}
                        className="block px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                      >
                        {n.label}
                      </Link>
                    ))}
                  </>
                )}
              </div>
              <div className="p-2 border-t border-slate-100">
                <form action="/api/auth/logout" method="post">
                  <button className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 font-medium">
                    Abmelden
                  </button>
                </form>
              </div>
            </div>
          </details>

          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Logo className="h-7 w-auto" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {nav.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={
                  "px-3 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap " +
                  (active === n.id
                    ? "bg-white/80 text-brand-700 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_4px_14px_-6px_rgba(0,126,128,0.35)] border border-white/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60")
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1 md:hidden" />

          {/* Hilfe-Icon */}
          <Link
            href="/hilfe"
            aria-label="Hilfe & Anleitung"
            title="Hilfe & Anleitung"
            className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </Link>

          {/* User-Avatar / Dropdown (Desktop) */}
          <details className="relative shrink-0 hidden md:block">
            <summary className="list-none cursor-pointer flex items-center gap-2 rounded-full hover:bg-brand-50 pl-2 pr-1 py-1">
              <span className="hidden lg:block text-sm text-slate-700 max-w-[140px] truncate">{session.name}</span>
              <span className="h-9 w-9 rounded-full bg-brand-500 text-white text-xs font-semibold flex items-center justify-center shadow-sm">
                {initials}
              </span>
            </summary>
            <div className="absolute right-0 mt-2 w-60 rounded-2xl glass-strong py-1 z-40">
              <div className="px-3 py-2 border-b border-slate-100">
                <div className="text-sm font-medium truncate">{session.name}</div>
                <div className="text-xs text-slate-500">{roleLabel(session.role)}</div>
              </div>
              <Link href="/account" className="block px-3 py-2 text-sm hover:bg-slate-50">
                Mein Konto
              </Link>
              <Link href="/hilfe" className="block px-3 py-2 text-sm hover:bg-slate-50">
                Hilfe &amp; Anleitung
              </Link>
              {isAdmin && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <div className="px-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                    Administration
                  </div>
                  {ADMIN.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href}
                      className="block px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {n.label}
                    </Link>
                  ))}
                </>
              )}
              <div className="border-t border-slate-100 my-1" />
              <form action="/api/auth/logout" method="post">
                <button className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  Abmelden
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</div>
      </main>
      <footer className="text-center text-xs text-slate-400 py-6 px-4">
        FB-Akademie Teilnahmemanagement
      </footer>
    </div>
  );
}

function roleLabel(r: Role) {
  switch (r) {
    case Role.ADMIN:
      return "Administrator";
    case Role.EDITOR:
      return "Schreibrechte";
    case Role.ACCOUNTING:
      return "Buchhaltung";
    case Role.VIEWER:
      return "Leserechte";
  }
}
