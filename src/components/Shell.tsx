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
  { id: "trainings", href: "/trainings", label: "Schulungen", roles: ["ADMIN", "EDITOR"] },
  { id: "accounting", href: "/accounting", label: "Buchhaltung", roles: ["ADMIN", "ACCOUNTING"] },
];

const ADMIN = [
  { id: "users", href: "/admin/users", label: "Benutzer" },
  { id: "audit", href: "/admin/audit", label: "Verlauf" },
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
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Logo className="h-7 w-auto" />
          </Link>
          <nav className="flex items-center gap-1 flex-1">
            {nav.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={
                  "px-3 py-1.5 rounded-md text-sm font-medium transition " +
                  (active === n.id
                    ? "text-brand-800 bg-brand-50"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100")
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <details className="relative shrink-0">
            <summary className="list-none cursor-pointer flex items-center gap-2 rounded-full hover:bg-slate-100 pl-2 pr-1 py-1">
              <span className="hidden sm:block text-sm text-slate-700">{session.name}</span>
              <span className="h-8 w-8 rounded-full bg-brand-100 text-brand-800 text-xs font-semibold flex items-center justify-center">
                {initials}
              </span>
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-20">
              <div className="px-3 py-2 border-b border-slate-100">
                <div className="text-sm font-medium truncate">{session.name}</div>
                <div className="text-xs text-slate-500">{roleLabel(session.role)}</div>
              </div>
              <Link href="/account" className="block px-3 py-2 text-sm hover:bg-slate-50">
                Mein Konto
              </Link>
              {isAdmin && (
                <>
                  <div className="border-t border-slate-100 my-1" />
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
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </main>
      <footer className="text-center text-xs text-slate-400 py-6">
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
