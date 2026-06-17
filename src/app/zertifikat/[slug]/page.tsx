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

  // Abgelaufene Zertifikate: validUntilShort als "TT.MM.JJJJ" parsen
  const isExpired = (() => {
    if (!isReleased || !data.validUntilShort) return false;
    const m = data.validUntilShort.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!m) return false;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return d.getTime() < Date.now();
  })();

  const typeLabel = cert.type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahmebescheinigung";

  // Status-Konfiguration: Farben, Headline-Text, Hero-Gradient
  const status = isRevoked
    ? {
        label: "Widerrufen",
        headline: "Zertifikat widerrufen",
        sub: "Dieses Zertifikat wurde zurückgezogen und ist nicht mehr gültig.",
        heroStyle: { background: "linear-gradient(135deg, #b91c1c 0%, #991b1b 50%, #7f1d1d 100%)" },
        ring: "bg-rose-50 text-rose-700 border-rose-200",
      }
    : isExpired
    ? {
        label: "Abgelaufen",
        headline: "Zertifikat abgelaufen",
        sub: "Die Gültigkeit dieses Zertifikats ist abgelaufen.",
        heroStyle: { background: "linear-gradient(135deg, #b91c1c 0%, #991b1b 50%, #7f1d1d 100%)" },
        ring: "bg-rose-50 text-rose-700 border-rose-200",
      }
    : isReleased
    ? {
        label: "Gültig",
        headline: "Zertifikat ist gültig",
        sub: "Echtheit bestätigt durch die Flüssigboden Akademie.",
        heroStyle: undefined, // fba-hero (Firmenfarbe Teal)
        ring: "bg-emerald-50 text-emerald-700 border-emerald-200",
      }
    : {
        label: "Nicht freigegeben",
        headline: "Noch nicht freigegeben",
        sub: "Dieses Zertifikat ist noch in Bearbeitung und nicht gültig.",
        heroStyle: { background: "linear-gradient(135deg, #d97706 0%, #b45309 50%, #92400e 100%)" },
        ring: "bg-amber-50 text-amber-700 border-amber-200",
      };

  return (
    <main className="min-h-screen bg-white">
      <header className={`relative overflow-hidden ${status.heroStyle ? "" : "fba-hero"}`} style={status.heroStyle}>
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-3xl mx-auto px-4 pt-12 pb-24 text-white text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="Flüssigboden Akademie" className="h-10 w-auto mx-auto mb-6 brightness-0 invert" />
          <div className="fba-pill mb-5">
            Validierung · {typeLabel}
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight">{status.headline}</h1>
          <p className="mt-4 text-sm sm:text-base text-white/85 max-w-xl mx-auto">{status.sub}</p>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 -mt-14 pb-12 relative">
        <div className="fba-card shadow-xl shadow-slate-900/5 overflow-hidden">
          <div className="px-6 sm:px-8 py-6 sm:py-7">
            <dl className="rounded-xl border border-slate-200 divide-y divide-slate-200 text-sm overflow-hidden">
              <Row label="Zertifikatsnummer">
                <span className="font-mono">{cert.number}</span>
              </Row>
              {(data.firstName || data.lastName) && (
                <Row label="Teilnehmer/in">{`${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()}</Row>
              )}
              {data.eventTitle && <Row label="Schulung">{data.eventTitle}</Row>}
              {data.kompetenzfeld?.label && (
                <Row label="Kompetenzfeld">{data.kompetenzfeld.label}</Row>
              )}
              {data.issuedDateShort && <Row label="Ausgestellt am">{data.issuedDateShort}</Row>}
              {data.validUntilShort && <Row label="Gültig bis">{data.validUntilShort}</Row>}
              {isRevoked && cert.revokedAt && (
                <Row label="Widerrufen am">
                  {new Date(cert.revokedAt).toLocaleDateString("de-DE")}
                  {cert.revokeReason ? (
                    <div className="text-xs text-slate-500 mt-0.5">{cert.revokeReason}</div>
                  ) : null}
                </Row>
              )}
            </dl>
          </div>

          <div className="px-6 sm:px-8 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${status.ring}`}>
              {status.label}
            </div>
            <Link
              href="/zertifikat"
              className="inline-flex items-center gap-2 text-xs text-brand-700 hover:text-brand-800 hover:underline"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
              Anderes Zertifikat prüfen
            </Link>
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
