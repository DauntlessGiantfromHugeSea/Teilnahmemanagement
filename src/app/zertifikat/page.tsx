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
  // Wenn der User auf "Prüfen" geklickt hat, leiten wir hier serverseitig
  // direkt auf /zertifikat/<slug> weiter.
  if (searchParams.q) {
    const slug = toSlug(searchParams.q);
    if (slug) redirect(`/zertifikat/${encodeURIComponent(slug)}`);
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="h-1.5 bg-brand-600" />
          <div className="p-6 sm:p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-fba.png" alt="FB-Akademie" className="h-10 w-auto mb-6" />
            <div className="text-xs uppercase tracking-wide text-slate-500">Validierung</div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1 mb-4">Zertifikat prüfen</h1>
            <p className="text-sm text-slate-600 mb-5">
              Geben Sie die Zertifikatsnummer ein (z.B. <span className="font-mono">24-SC-FBA/0</span>),
              um die Gültigkeit zu prüfen.
            </p>

            <form method="get" className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Zertifikatsnummer</span>
                <input
                  type="text"
                  name="q"
                  placeholder="24-SC-FBA/0"
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
              <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-brand-700">
                Prüfen
              </button>
            </form>
            {searchParams.error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
                {searchParams.error}
              </div>
            )}
          </div>
          <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
            Flüssigboden Akademie UG · Merseburger Str. 189 · 04179 Leipzig
          </div>
        </div>
      </div>
    </main>
  );
}
