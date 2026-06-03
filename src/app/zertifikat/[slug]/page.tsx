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

  const statusBadge = isRevoked
    ? { label: "WIDERRUFEN", color: "bg-rose-100 text-rose-700 border-rose-200" }
    : isReleased
    ? { label: "GÜLTIG", color: "bg-emerald-100 text-emerald-700 border-emerald-200" }
    : { label: "NICHT FREIGEGEBEN", color: "bg-slate-100 text-slate-600 border-slate-200" };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Brandstreifen */}
          <div className="h-1.5 bg-brand-600" />
          <div className="p-6 sm:p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-fba.png" alt="FB-Akademie" className="h-10 w-auto mb-6" />

            <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {cert.type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahmebescheinigung"}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mt-1">Validierung</h1>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
            </div>

            <dl className="space-y-3 text-sm">
              <Row label="Nummer">{cert.number}</Row>
              <Row label="Teilnehmer/in">{data.firstName} {data.lastName}</Row>
              {data.company && <Row label="Firma">{data.company}</Row>}
              <Row label="Schulung">{data.eventTitle}</Row>
              <Row label="Datum">{data.eventDateShort}</Row>
              <Row label="Aussteller">{data.aussteller}</Row>
              {cert.releasedAt && (
                <Row label="Freigegeben am">
                  {new Date(cert.releasedAt).toLocaleDateString("de-DE")}
                </Row>
              )}
              {isRevoked && cert.revokedAt && (
                <Row label="Widerrufen am">
                  {new Date(cert.revokedAt).toLocaleDateString("de-DE")}
                  {cert.revokeReason ? ` — ${cert.revokeReason}` : ""}
                </Row>
              )}
            </dl>

            {isReleased && (
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={`/api/zertifikat/${cert.slug}/pdf`}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700"
                >
                  PDF herunterladen
                </a>
              </div>
            )}

            {!isReleased && !isRevoked && (
              <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                Dieses Zertifikat wurde noch nicht freigegeben und ist daher nicht gültig.
              </div>
            )}
            {isRevoked && (
              <div className="mt-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
                Dieses Zertifikat wurde widerrufen und ist nicht mehr gültig.
              </div>
            )}
          </div>
          <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
            Flüssigboden Akademie UG · Merseburger Str. 189 · 04179 Leipzig ·
            <a href="https://www.fb-akademie.de" className="text-brand-700 hover:underline ml-1">www.fb-akademie.de</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="text-xs uppercase tracking-wide text-slate-500 w-32 shrink-0">{label}</dt>
      <dd className="font-medium text-slate-900">{children}</dd>
    </div>
  );
}
