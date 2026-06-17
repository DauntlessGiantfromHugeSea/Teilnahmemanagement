import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function toSlug(input: string): string {
  return input.trim().replace(/\s+/g, "").replace(/\//g, "-");
}

export default function ZertifikatLookupPage({
  searchParams,
}: {
  searchParams: { q?: string; error?: string };
}) {
  if (searchParams.q) {
    const slug = toSlug(searchParams.q);
    if (slug) redirect(`/zertifikat/${encodeURIComponent(slug)}`);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900" />
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-3xl mx-auto px-4 pt-12 pb-16 text-white text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="Flüssigboden Akademie" className="h-12 w-auto mx-auto mb-6 brightness-0 invert" />
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[11px] font-semibold uppercase tracking-wider mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
            Zertifikatsprüfung
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">Zertifikat prüfen</h1>
          <p className="mt-3 text-sm sm:text-base text-white/85 max-w-xl mx-auto">
            Prüfen Sie hier die Echtheit und Gültigkeit eines Zertifikats oder einer
            Teilnahmebescheinigung der Flüssigboden Akademie.
          </p>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 -mt-10 pb-10 relative">
        <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/10 border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8">
            <form method="get" className="space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Zertifikatsnummer</span>
                <input
                  type="text"
                  name="q"
                  placeholder="z. B. 24-SC-FBA/0"
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 bg-slate-50 text-base font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition"
                />
                <span className="block text-xs text-slate-500 mt-1.5">
                  Die Nummer finden Sie auf der Urkunde unten rechts.
                </span>
              </label>
              <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-brand-700 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                Prüfen
              </button>
            </form>
            {searchParams.error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
                {searchParams.error}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid sm:grid-cols-3 gap-3">
          <Feature
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
            title="Echtheit"
            text="Direkter Abgleich mit unserer Datenbank."
          />
          <Feature
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
            title="Gültigkeit"
            text="Zeigt das Ablaufdatum nach 24 Monaten."
          />
          <Feature
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>}
            title="Widerruf"
            text="Erkennt zurückgezogene Zertifikate sofort."
          />
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          Flüssigboden Akademie UG · Merseburger Str. 189 · 04179 Leipzig ·{" "}
          <a href="https://www.fb-akademie.de" className="text-brand-700 hover:underline">www.fb-akademie.de</a>
        </p>
      </div>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 text-center shadow-sm">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-brand-50 text-brand-700 mb-2">{icon}</div>
      <div className="font-semibold text-sm text-slate-900">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5 leading-snug">{text}</div>
    </div>
  );
}
