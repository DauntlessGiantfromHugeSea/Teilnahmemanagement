import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { KOMPETENZFELDER, parseDefaults } from "@/lib/certificateContent";

export const dynamic = "force-dynamic";

export default async function EventCertificatesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect("/events");
  const canWrite = await canWriteEvent(s, params.id);

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      training: true,
      participants: {
        include: { certificates: { orderBy: { createdAt: "desc" } } },
      },
    },
  });
  if (!ev) notFound();

  const participants = ev.participants
    .map((p) => ({ ...p, dec: decryptParticipant(p) }))
    .sort((a, b) => {
      const ln = (a.dec.lastName ?? "").localeCompare(b.dec.lastName ?? "", "de");
      if (ln !== 0) return ln;
      return (a.dec.firstName ?? "").localeCompare(b.dec.firstName ?? "", "de");
    });

  const defaults = parseDefaults(ev.training.certDefaults);
  const defaultK = new Set(defaults.defaultKompetenzfelder ?? []);

  const allCerts = participants.flatMap((p) => p.certificates);
  const draftCount = allCerts.filter((c) => c.status === "DRAFT").length;
  const releasedCount = allCerts.filter((c) => c.status === "RELEASED").length;
  const sentCount = allCerts.filter((c) => c.sentAt).length;

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Zertifikate &amp; Bescheinigungen</h1>
      <p className="text-sm text-slate-500 mb-5">
        Pro Teilnehmer eine Bescheinigung (T) oder ein Zertifikat (Z) anlegen, ausdrucken,
        nach Freigabe per Mail versenden.
      </p>

      {searchParams.ok && (
        <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>
      )}
      {searchParams.error && (
        <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>
      )}

      <div className="card p-4 mb-5 grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Entwurf</div>
          <div className="text-2xl font-semibold">{draftCount}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Freigegeben</div>
          <div className="text-2xl font-semibold text-emerald-700">{releasedCount}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Versendet</div>
          <div className="text-2xl font-semibold text-brand-700">{sentCount}</div>
        </div>
      </div>

      {/* Bulk-Aktionen */}
      {canWrite && (
        <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
          <a
            href={`/api/events/${ev.id}/certificates/print`}
            className="btn-secondary text-sm"
          >
            Alle freigegebenen drucken (PDF)
          </a>
          <form method="post" action={`/api/events/${ev.id}/certificates/send-batch`}>
            <button className="btn-primary text-sm">
              Alle freigegebenen versenden
            </button>
          </form>
          <span className="text-xs text-slate-500">
            Versendet nur Zertifikate mit Status „freigegeben" und noch nicht verschickt.
          </span>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Bescheinigungen</th>
              {canWrite && <th className="text-right">Aktionen</th>}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const tn = p.certificates.find((c) => c.type === "TEILNAHMEBESCHEINIGUNG");
              const z = p.certificates.find((c) => c.type === "ZERTIFIKAT");
              return (
                <tr key={p.id} className="align-top">
                  <td className="py-3">
                    <div className="font-medium text-sm">{p.dec.lastName}, {p.dec.firstName}</div>
                    <div className="text-xs font-mono text-slate-500">{p.dec.email}</div>
                    {p.dec.company && (
                      <div className="text-xs text-slate-500">{p.dec.company}</div>
                    )}
                  </td>
                  <td className="py-3 space-y-2">
                    {p.certificates.length === 0 && (
                      <span className="text-xs text-slate-400 italic">noch keine</span>
                    )}
                    {p.certificates.map((c) => (
                      <CertRow key={c.id} cert={c} canWrite={canWrite} />
                    ))}
                  </td>
                  {canWrite && (
                    <td className="py-3 text-right space-y-1">
                      {!tn && (
                        <form method="post" action={`/api/events/${ev.id}/certificates/create`} className="inline-block">
                          <input type="hidden" name="participantId" value={p.id} />
                          <input type="hidden" name="type" value="TEILNAHMEBESCHEINIGUNG" />
                          <button className="text-xs text-brand-700 hover:underline">
                            + Teilnahmebescheinigung
                          </button>
                        </form>
                      )}
                      {!z && (
                        <form method="post" action={`/api/events/${ev.id}/certificates/create`} className="block">
                          <input type="hidden" name="participantId" value={p.id} />
                          <input type="hidden" name="type" value="ZERTIFIKAT" />
                          {KOMPETENZFELDER.filter((k) => defaultK.has(k.id)).map((k) => (
                            <input key={k.id} type="hidden" name="kompetenz" value={k.id} />
                          ))}
                          <button className="text-xs text-brand-700 hover:underline">
                            + Zertifikat
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {participants.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 3 : 2} className="text-center text-slate-500 py-8">
                  Keine Teilnehmer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function CertRow({
  cert,
  canWrite,
}: {
  cert: { id: string; number: string; slug: string; type: "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG"; status: "DRAFT" | "RELEASED" | "REVOKED"; sentAt: Date | null; sentTo: string | null };
  canWrite: boolean;
}) {
  const typeLabel = cert.type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahmebescheinigung";
  const badge =
    cert.status === "RELEASED"
      ? "bg-emerald-100 text-emerald-700"
      : cert.status === "REVOKED"
      ? "bg-rose-100 text-rose-700"
      : "bg-slate-100 text-slate-600";
  return (
    <div className="flex items-center flex-wrap gap-2 text-xs border border-slate-200 rounded-lg px-3 py-2">
      <span className={`px-2 py-0.5 rounded-full font-semibold ${badge}`}>
        {cert.status === "RELEASED" ? "freigegeben" : cert.status === "REVOKED" ? "widerrufen" : "Entwurf"}
      </span>
      <span className="font-medium">{typeLabel}</span>
      <span className="font-mono text-slate-500">{cert.number}</span>
      <a href={`/zertifikat/${cert.slug}`} target="_blank" className="text-brand-700 hover:underline">Validierung</a>
      <a href={`/api/certificates/${cert.id}/preview`} target="_blank" className="text-brand-700 hover:underline">PDF</a>
      {cert.sentAt && (
        <span className="text-slate-500">
          versendet {new Date(cert.sentAt).toLocaleDateString("de-DE")}
          {cert.sentTo ? ` an ${cert.sentTo}` : ""}
        </span>
      )}
      {canWrite && cert.status === "DRAFT" && (
        <form method="post" action={`/api/certificates/${cert.id}/release`} className="inline">
          <button className="text-emerald-700 hover:underline">freigeben</button>
        </form>
      )}
      {canWrite && cert.status === "RELEASED" && !cert.sentAt && (
        <form method="post" action={`/api/certificates/${cert.id}/send`} className="inline">
          <button className="text-brand-700 hover:underline">jetzt versenden</button>
        </form>
      )}
      {canWrite && cert.status === "RELEASED" && (
        <form method="post" action={`/api/certificates/${cert.id}/revoke`} className="inline">
          <button className="text-rose-700 hover:underline">widerrufen</button>
        </form>
      )}
      {canWrite && cert.status === "DRAFT" && (
        <form method="post" action={`/api/certificates/${cert.id}/delete`} className="inline">
          <button className="text-slate-500 hover:text-rose-700 hover:underline">löschen</button>
        </form>
      )}
    </div>
  );
}
