export const dynamic = "force-dynamic";

export default function MeineZertifikateCodePage({
  searchParams,
}: {
  searchParams: { email?: string; error?: string };
}) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="h-1.5 bg-brand-600" />
        <div className="p-6 sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="FB-Akademie" className="h-10 w-auto mb-6" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">Code eingeben</h1>
          <p className="text-sm text-slate-600 mb-5">
            Bitte geben Sie den 6-stelligen Code ein, den wir Ihnen gerade an
            <strong className="text-slate-900"> {searchParams.email ?? "Ihre E-Mail"} </strong>
            geschickt haben.
          </p>
          {searchParams.error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
              {searchParams.error}
            </div>
          )}
          <form method="post" action="/api/meine-zertifikate/verify" className="space-y-3">
            <input type="hidden" name="email" value={searchParams.email ?? ""} />
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Code</span>
              <input
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
                maxLength={6}
                placeholder="123456"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-brand-700">
              Anmelden
            </button>
          </form>
          <p className="mt-4 text-xs text-slate-500">
            Keinen Code erhalten? <a href={`/meine-zertifikate${searchParams.email ? `?ok=${encodeURIComponent("Bitte fordern Sie einen neuen Code an.")}` : ""}`} className="text-brand-700 hover:underline">Neuen Code anfordern</a>
          </p>
        </div>
      </div>
    </main>
  );
}
