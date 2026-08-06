import Link from "next/link";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { CertificateBell } from "./CertificateBell";
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
  { id: "exports", href: "/exports/participants", label: "Export", roles: ["ADMIN", "EDITOR", "ACCOUNTING"] },
  { id: "newsletter", href: "/admin/newsletter", label: "Newsletter", roles: ["ADMIN"] },
];

const ADMIN = [
  { id: "users", href: "/admin/users", label: "Benutzer" },
  { id: "media", href: "/admin/media", label: "Media-Library" },
  { id: "audit", href: "/admin/audit", label: "Verlauf" },
  { id: "import", href: "/admin/import", label: "Import (CSV)" },
  { id: "settings", href: "/admin/settings", label: "Einstellungen" },
  { id: "zertifikate", href: "/admin/zertifikate", label: "Alle Zertifikate" },
  { id: "staff-badges", href: "/admin/staff-badges", label: "Mitarbeiter-Badges" },
  { id: "kompetenzfelder", href: "/admin/kompetenzfelder", label: "Zertifikat-Texte" },
  { id: "tags", href: "/admin/tags", label: "Tags / Kategorien" },
  { id: "feedback-fragen", href: "/admin/feedback-fragen", label: "Feedback-Fragen" },
  { id: "wissenstest", href: "/admin/wissenstest", label: "Wissenstest-Fragen" },
  { id: "brief", href: "/admin/brief", label: "Brief drucken" },
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
      {session.impersonatorUid && (
        <div className="sticky top-0 z-40 bg-amber-500 text-ink border-b-2 border-amber-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <strong>👤 Support-Modus:</strong> Du siehst die App als{" "}
              <strong>{session.name}</strong> ({session.email})
              {session.impersonatorName ? <> — angemeldet durch <strong>{session.impersonatorName}</strong></> : null}.
            </div>
            <form method="post" action="/api/admin/users/impersonate/stop">
              <button className="rounded-full bg-ink text-white px-4 py-1.5 text-xs font-semibold hover:bg-ink-700">
                ← Zurück zu meinem Konto
              </button>
            </form>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 bg-brand-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-6">
          <MobileMenu
            name={session.name}
            role={session.role}
            active={active}
            nav={nav}
            admin={ADMIN}
            isAdmin={isAdmin}
          />

          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Logo className="h-7 w-auto brightness-0 invert" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {nav.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={
                  "px-4 py-1.5 rounded-full text-sm font-semibold transition whitespace-nowrap " +
                  (active === n.id
                    ? "bg-accent text-ink"
                    : "text-white/85 hover:text-white hover:bg-white/10")
                }
              >
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <details className="relative">
                <summary
                  className={
                    "list-none cursor-pointer px-4 py-1.5 rounded-full text-sm font-semibold transition whitespace-nowrap flex items-center gap-1 " +
                    (ADMIN.some((a) => a.id === active)
                      ? "bg-accent text-ink"
                      : "text-white/85 hover:text-white hover:bg-white/10")
                  }
                >
                  Administration
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="absolute left-0 mt-2 w-60 rounded-2xl bg-white shadow-xl border border-slate-200 py-1 z-40">
                  {ADMIN.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href}
                      className={
                        "block px-3 py-2 text-sm hover:bg-slate-50 " +
                        (active === n.id ? "text-brand-700 font-medium" : "text-slate-700")
                      }
                    >
                      {n.label}
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </nav>
          <div className="flex-1 md:hidden" />

          {/* Zertifikat-Pruefungs-Glocke (nur Admin) */}
          <CertificateBell session={session} />

          {/* Hilfe-Icon */}
          <Link
            href="/hilfe"
            aria-label="Hilfe & Anleitung"
            title="Hilfe & Anleitung"
            className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </Link>

          {/* User-Avatar / Dropdown (Desktop) */}
          <details className="relative shrink-0 hidden md:block">
            <summary className="list-none cursor-pointer flex items-center gap-2 rounded-full hover:bg-white/10 pl-2 pr-1 py-1">
              <span className="hidden lg:block text-sm text-white/90 max-w-[140px] truncate">{session.name}</span>
              <span className="h-9 w-9 rounded-full bg-accent text-ink text-xs font-bold flex items-center justify-center shadow-sm">
                {initials}
              </span>
            </summary>
            <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white shadow-xl border border-slate-200 py-1 z-40 text-slate-700">
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
