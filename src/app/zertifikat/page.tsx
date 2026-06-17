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
    <main className="min-h-screen bg-white">
      <header className="relative overflow-hidden fba-hero">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-3xl mx-auto px-4 pt-14 pb-20 text-white text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="Flüssigboden Akademie" className="h-12 w-auto mx-auto mb-6 brightness-0 invert" />
          <div className="fba-pill mb-5">Zertifikatsprüfung</div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight">Zertifikat prüfen</h1>
          <p className="mt-4 text-sm sm:text-base text-white/85 max-w-xl mx-auto">
            Prüfen Sie hier die Echtheit und Gültigkeit eines Zertifikats oder einer
            Teilnahmebescheinigung der Flüssigboden Akademie.
          </p>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 -mt-14 pb-12 relative">
        <div className="fba-card shadow-xl shadow-slate-900/5 overflow-hidden">
          <div className="p-6 sm:p-8">
            <form method="get" className="space-y-4">
              <label className="block">
                <span className="block text-xs font-bold text-ink mb-1.5 uppercase tracking-wider">Zertifikatsnummer</span>
                <input
                  type="text"
                  name="q"
                  placeholder="z. B. 24-SC-FBA/0"
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 bg-slate-50 text-base font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition"
                />
                <span className="block text-xs text-slate-500 mt-1.5">
                  Die Nummer finden Sie auf der Urkunde unten links.
                </span>
              </label>
              <button className="w-full fba-cta py-3.5">
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
    <div className="rounded-2xl bg-white border border-slate-200 p-5 text-center shadow-sm">
      <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-accent text-ink mb-3">{icon}</div>
      <div className="font-bold text-sm text-ink">{title}</div>
      <div className="text-xs text-slate-500 mt-1 leading-snug">{text}</div>
    </div>
  );
}
