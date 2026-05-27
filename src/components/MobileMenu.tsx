"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Role } from "@prisma/client";

interface NavItem {
  id: string;
  href: string;
  label: string;
}

interface Props {
  name: string;
  role: Role;
  active?: string;
  nav: NavItem[];
  admin: NavItem[];
  isAdmin: boolean;
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  EDITOR: "Schreibrechte",
  ACCOUNTING: "Buchhaltung",
  VIEWER: "Leserechte",
};

export function MobileMenu({ name, role, active, nav, admin, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Scroll-Lock und ESC-Close
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Menü öffnen"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="md:hidden h-10 w-10 -ml-2 flex items-center justify-center rounded-lg hover:bg-brand-50 active:bg-brand-100 shrink-0"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        >
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          {/* Drawer */}
          <div
            className="absolute left-0 top-0 bottom-0 w-80 max-w-[88vw] bg-white shadow-2xl flex flex-col"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <div className="p-4 border-b border-slate-100 flex items-start gap-3">
              <span className="h-10 w-10 rounded-full bg-brand-500 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{name}</div>
                <div className="text-xs text-slate-500 truncate">{ROLE_LABEL[role]}</div>
              </div>
              <button
                type="button"
                aria-label="Menü schließen"
                onClick={() => setOpen(false)}
                className="h-10 w-10 -mr-2 -mt-1 flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 shrink-0"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="p-2 overflow-y-auto flex-1">
              {nav.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={
                    "block px-3 py-3 rounded-xl text-[15px] font-medium transition " +
                    (active === n.id
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-700 hover:bg-slate-100")
                  }
                >
                  {n.label}
                </Link>
              ))}
              <div className="border-t border-slate-100 my-2" />
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="block px-3 py-3 rounded-xl text-[15px] text-slate-700 hover:bg-slate-100"
              >
                Mein Konto
              </Link>
              <Link
                href="/hilfe"
                onClick={() => setOpen(false)}
                className="block px-3 py-3 rounded-xl text-[15px] text-slate-700 hover:bg-slate-100"
              >
                Hilfe &amp; Anleitung
              </Link>
              {isAdmin && (
                <>
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                    Administration
                  </div>
                  {admin.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-3 rounded-xl text-[15px] text-slate-700 hover:bg-slate-100"
                    >
                      {n.label}
                    </Link>
                  ))}
                </>
              )}
            </nav>
            <div className="p-2 border-t border-slate-100">
              <form action="/api/auth/logout" method="post">
                <button className="block w-full text-left px-3 py-3 rounded-xl text-[15px] text-red-600 hover:bg-red-50 font-medium">
                  Abmelden
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
