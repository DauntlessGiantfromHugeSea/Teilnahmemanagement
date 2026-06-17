import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPortalEmailHash } from "@/lib/certPortal";
import { parseCertificateData } from "@/lib/certificates";

export const dynamic = "force-dynamic";

export default async function MeineZertifikatePage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const emailHash = await getPortalEmailHash();
  if (!emailHash) {
    return (
      <main className="min-h-screen bg-white">
        <header className="relative overflow-hidden fba-hero">
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
          <div className="relative max-w-3xl mx-auto px-4 pt-12 pb-20 text-white text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-fba.png" alt="Flüssigboden Akademie" className="h-10 w-auto mx-auto mb-6 brightness-0 invert" />
            <div className="fba-pill mb-5">Zertifikats-Portal</div>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight">Meine Zertifikate</h1>
            <p className="mt-4 text-sm sm:text-base text-white/85 max-w-xl mx-auto">
              Geben Sie Ihre E-Mail-Adresse ein, mit der Sie sich zur Schulung angemeldet haben.
              Wir senden Ihnen einen 6-stelligen Code zur Anmeldung.
            </p>
          </div>
        </header>
        <div className="max-w-md mx-auto px-4 -mt-14 pb-12 relative">
          <div className="fba-card shadow-xl shadow-slate-900/5 overflow-hidden">
          <div className="p-6 sm:p-8">

            {searchParams.error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
                {searchParams.error}
              </div>
            )}
            {searchParams.ok && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
                {searchParams.ok}
              </div>
            )}

            <form method="post" action="/api/meine-zertifikate/request" className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">E-Mail-Adresse</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="ihre.adresse@beispiel.de"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
              <button className="w-full fba-cta py-3">
                Code anfordern
              </button>
            </form>
            <p className="mt-4 text-xs text-slate-500">
              Schon einen Code? <Link href="/meine-zertifikate/code" className="text-brand-700 hover:underline">Code eingeben</Link>
            </p>
          </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            Flüssigboden Akademie UG · Merseburger Str. 189 · 04179 Leipzig
          </p>
        </div>
      </main>
    );
  }

  // Authentifiziert: Zertifikate fuer diese Adresse laden
  const participants = await prisma.participant.findMany({
    where: { emailHash },
    include: {
      event: true,
      certificates: { orderBy: { createdAt: "desc" } },
    },
  });
  const certs = participants.flatMap((p) =>
    p.certificates.map((c) => ({ c, event: p.event }))
  );
  const released = certs.filter((x) => x.c.status === "RELEASED");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="FB-Akademie" className="h-10 w-auto" />
          <form method="post" action="/api/meine-zertifikate/logout">
            <button className="text-sm text-slate-500 hover:text-rose-700">Abmelden</button>
          </form>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Meine Zertifikate</h1>
        <p className="text-sm text-slate-500 mb-6">
          Alle Bescheinigungen, die zu Ihrer E-Mail-Adresse hinterlegt sind.
        </p>

        {released.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
            Aktuell sind keine freigegebenen Zertifikate für Ihre Adresse hinterlegt.
            Sollten Sie kürzlich an einer Schulung teilgenommen haben, melden Sie sich bitte
            unter info@fb-akademie.de.
          </div>
        ) : (
          <div className="space-y-3">
            {released.map(({ c, event }) => {
              const data = (() => { try { return parseCertificateData(c.data); } catch { return null; } })();
              return (
                <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline flex-wrap gap-2">
                      <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                        gültig
                      </span>
                      <span className="font-semibold text-slate-900">
                        {c.type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahmebescheinigung"}
                      </span>
                      {data?.kompetenzfeld && (
                        <span className="text-sm text-slate-600">{data.kompetenzfeld.label}</span>
                      )}
                    </div>
                    <div className="text-sm text-slate-700 mt-1">{event.title}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">{c.number}</div>
                    {data?.validUntilShort && (
                      <div className="text-xs text-slate-500 mt-1">Gültig bis {data.validUntilShort}</div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <a
                      href={`/zertifikat/${c.slug}`}
                      target="_blank"
                      className="text-sm text-brand-700 hover:underline"
                    >
                      Validierung
                    </a>
                    <a
                      href={`/api/zertifikat/${c.slug}/pdf`}
                      target="_blank"
                      className="fba-cta py-2 px-4 text-xs"
                    >
                      PDF herunterladen
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
