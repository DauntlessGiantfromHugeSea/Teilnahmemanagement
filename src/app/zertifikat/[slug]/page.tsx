import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseCertificateData } from "@/lib/certificates";

export const dynamic = "force-dynamic";

export default async function ZertifikatValidierungsPage({
  params,
}: {
  params: { slug: string };
}) {
  const cert = await prisma.certificate.findUnique({
    where: { slug: params.slug },
  });
  if (!cert) notFound();

  const data = parseCertificateData(cert.data);
  const isReleased = cert.status === "RELEASED";
  const isRevoked = cert.status === "REVOKED";

  const typeLabel = cert.type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahmebescheinigung";

  // Status-Konfiguration: Farben, Icon, Headline-Text
  const status = isRevoked
    ? {
        kind: "revoked" as const,
        label: "Widerrufen",
        headline: "Dieses Zertifikat wurde widerrufen.",
        hero: "from-rose-600 via-rose-700 to-rose-900",
        ring: "bg-rose-50 text-rose-700 border-rose-200",
        icon: (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ),
      }
    : isReleased
    ? {
        kind: "valid" as const,
        label: "Gültig",
        headline: "Dieses Zertifikat ist echt und gültig.",
        hero: "from-brand-600 via-brand-700 to-brand-900",
        ring: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        ),
      }
    : {
        kind: "pending" as const,
        label: "Nicht freigegeben",
        headline: "Dieses Zertifikat wurde noch nicht freigegeben.",
        hero: "from-amber-600 via-amber-700 to-amber-900",
        ring: "bg-amber-50 text-amber-700 border-amber-200",
        icon: (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        ),
      };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/30">
      <header className="relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${status.hero}`} />
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-3xl mx-auto px-4 pt-10 pb-20 text-white text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="Flüssigboden Akademie" className="h-10 w-auto mx-auto mb-6 brightness-0 invert" />
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[11px] font-semibold uppercase tracking-wider mb-4">
            Validierung · {typeLabel}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight max-w-xl mx-auto">{status.headline}</h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 -mt-14 pb-10 relative">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 text-center">
            <div className={`inline-flex items-center justify-center h-20 w-20 rounded-full border-4 mb-4 ${status.ring}`}>
              {status.icon}
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${status.ring}`}>
              {status.label}
            </div>
          </div>

          <div className="px-6 sm:px-8 pb-6 sm:pb-8">
            <dl className="rounded-xl border border-slate-200 divide-y divide-slate-200 text-sm overflow-hidden">
              <Row label="Zertifikatsnummer">
                <span className="font-mono">{cert.number}</span>
              </Row>
              {data.validUntilShort && (
                <Row label="Gültig bis">{data.validUntilShort}</Row>
              )}
              {isRevoked && cert.revokedAt && (
                <Row label="Widerrufen am">
                  {new Date(cert.revokedAt).toLocaleDateString("de-DE")}
                  {cert.revokeReason ? (
                    <div className="text-xs text-slate-500 mt-0.5">{cert.revokeReason}</div>
                  ) : null}
                </Row>
              )}
            </dl>

            <div className="mt-5">
              <Link
                href="/zertifikat"
                className="inline-flex items-center gap-2 text-sm text-brand-700 hover:text-brand-800 hover:underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                Anderes Zertifikat prüfen
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          Flüssigboden Akademie UG · Merseburger Str. 189 · 04179 Leipzig ·{" "}
          <a href="https://www.fb-akademie.de" className="text-brand-700 hover:underline">www.fb-akademie.de</a>
        </p>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 bg-white">
      <dt className="text-[11px] uppercase tracking-wider text-slate-500 w-32 shrink-0 font-semibold">{label}</dt>
      <dd className="font-medium text-slate-900 flex-1">{children}</dd>
    </div>
  );
}
