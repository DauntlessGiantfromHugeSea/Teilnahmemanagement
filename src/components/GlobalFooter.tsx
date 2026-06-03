"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function GlobalFooter() {
  const sp = useSearchParams();
  const path = usePathname();
  // Im Embed-Modus (z.B. iframe-Einbettung) keinen Footer rendern.
  const embed = sp?.get("embed");
  if (path?.startsWith("/anmeldung") && (embed === "1" || embed === "form")) return null;
  return (
    <footer className="border-t border-slate-200 bg-white/60 py-4 px-4 text-xs text-slate-500 text-center">
      <a href="https://fb-akademie.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:text-brand-700 hover:underline">
        Impressum
      </a>
      <span className="mx-2 text-slate-300">·</span>
      <a href="https://fb-akademie.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:text-brand-700 hover:underline">
        Datenschutz
      </a>
    </footer>
  );
}
