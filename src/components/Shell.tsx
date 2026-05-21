import Link from "next/link";
import { Logo } from "./Logo";
import type { SessionPayload } from "@/lib/session";
import { Role } from "@prisma/client";

interface Props {
  session: SessionPayload;
  active?: string;
  children: React.ReactNode;
}

const NAV = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "EDITOR", "ACCOUNTING", "VIEWER"] },
  { id: "events", href: "/events", label: "Veranstaltungen", roles: ["ADMIN", "EDITOR", "ACCOUNTING", "VIEWER"] },
  { id: "trainings", href: "/trainings", label: "Schulungen", roles: ["ADMIN", "EDITOR"] },
  { id: "accounting", href: "/accounting", label: "Buchhaltung", roles: ["ADMIN", "ACCOUNTING"] },
  { id: "users", href: "/admin/users", label: "Benutzer", roles: ["ADMIN"] },
  { id: "audit", href: "/admin/audit", label: "Verlauf (global)", roles: ["ADMIN"] },
];

export function Shell({ session, active, children }: Props) {
  const items = NAV.filter((n) => n.roles.includes(session.role));
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Logo className="h-9 w-auto" />
            <span className="text-sm font-semibold text-slate-700 hidden md:block">
              Teilnahmemanagement
            </span>
          </Link>
          <nav className="flex items-center gap-1 flex-wrap">
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={
                  "px-3 py-2 rounded-md text-sm font-medium " +
                  (active === n.id
                    ? "bg-brand-50 text-brand-800"
                    : "text-slate-600 hover:bg-slate-100")
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">{session.name}</div>
              <div className="text-xs text-slate-500">
                {roleLabel(session.role)}
              </div>
            </div>
            <Link href="/account" className="btn-secondary text-xs">
              Konto
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="btn-secondary text-xs">Abmelden</button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </main>
      <footer className="text-center text-xs text-slate-400 py-6">
        FB-Akademie Teilnahmemanagement &mdash; verschluesselt, 2FA-geschuetzt
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
