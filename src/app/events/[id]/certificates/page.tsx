import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent, isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { parseDefaults } from "@/lib/certificateContent";
import { getKompetenzfelder } from "@/lib/kompetenzfelder";

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
  const admin = isAdmin(s);

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
  const kompetenzfelder = await getKompetenzfelder();

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
        <div className="card p-4 mb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/events/${ev.id}/certificates/print`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Alle für den Druck (mit Briefkopf)
            </a>
            <a
              href={`/api/events/${ev.id}/certificates/print?bg=0`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Alle für den Druck (ohne Hintergrund, für Briefpapier)
            </a>
            <span className="text-xs text-slate-500">
              Enthält Entwürfe und freigegebene — zum Ausdrucken, Unterschreiben und Stempeln vor dem Event.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/events/${ev.id}/certificates/print?released=1`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Nur freigegebene drucken
            </a>
            <a
              href={`/api/events/${ev.id}/certificates/print?released=1&bg=0`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Nur freigegebene (ohne Hintergrund)
            </a>
            <form method="post" action={`/api/events/${ev.id}/certificates/release-all`}>
              <button className="btn-secondary text-sm" title="Setzt alle Entwürfe auf 'freigegeben'">
                ✓ Alle Entwürfe freigeben
              </button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200">
            <span className="text-xs font-semibold text-slate-600 w-full sm:w-auto">Nur Teilnahmebescheinigungen (TN):</span>
            <a
              href={`/api/events/${ev.id}/certificates/print?type=TN`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Alle TN drucken (mit Briefkopf)
            </a>
            <a
              href={`/api/events/${ev.id}/certificates/print?type=TN&bg=0`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Alle TN (ohne Hintergrund)
            </a>
            <a
              href={`/api/events/${ev.id}/certificates/print?type=TN&released=1`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Nur freigegebene TN
            </a>
            <a
              href={`/api/events/${ev.id}/certificates/print?type=TN&released=1&bg=0`}
              target="_blank"
              className="btn-secondary text-sm"
            >
              Nur freigegebene TN (ohne Hintergrund)
            </a>
            <form method="post" action={`/api/events/${ev.id}/certificates/regenerate`}>
              <button className="btn-secondary text-sm" title="Bestehende Zertifikate behalten ihre Nummer, bekommen aber aktuelles Datum + aktuelle Texte (Bestätigungstexte, Geschäftsführer-Name, Gültigkeit, …) frisch eingefroren.">
                ♻ Alle neu generieren (Datum + Texte aktualisieren)
              </button>
            </form>
            <form method="post" action={`/api/events/${ev.id}/certificates/send-batch`}>
              <button className="btn-primary text-sm">
                Alle freigegebenen per Mail versenden
              </button>
            </form>
            <span className="text-xs text-slate-500">
              Mail-Versand nur auf deinen Klick; bereits versendete werden übersprungen.
            </span>
          </div>
        </div>
      )}

      {/* Eigene Bulk-Form ausserhalb der Tabelle - Checkboxen verlinken sich
          via form-Attribut. Dadurch kein Nesting mit den Einzel-Actions. */}
      {canWrite && (
        <form
          id="cert-bulk-form"
          method="post"
          action={`/api/events/${ev.id}/certificates/create`}
          className="card overflow-hidden mb-3"
        >
          <div className="px-4 py-3 bg-slate-50 flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-600 mr-auto">
              Bulk-Aktionen für ausgewählte Teilnehmer:
            </span>
            <button name="type" value="TEILNAHMEBESCHEINIGUNG" className="btn-secondary text-xs">
              + Teilnahmebescheinigung(en)
            </button>
            <details className="relative inline-block">
              <summary className="btn-secondary text-xs list-none cursor-pointer">
                + Zertifikat(e) mit Kompetenzfeld …
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-80 rounded-xl border border-slate-200 bg-white shadow-lg p-3 max-h-80 overflow-auto">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                  Kompetenzfelder auswählen
                </div>
                {kompetenzfelder.map((k) => (
                  <label key={k.id} className="flex items-start gap-2 text-xs py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      name="kompetenz"
                      value={k.id}
                      defaultChecked={defaultK.has(k.id)}
                      className="mt-0.5 h-3.5 w-3.5 accent-brand-600"
                    />
                    <span>{k.label}</span>
                  </label>
                ))}
                <button name="type" value="ZERTIFIKAT" className="btn-primary text-xs w-full mt-2">
                  Anlegen
                </button>
              </div>
            </details>
            <span className="text-[11px] text-slate-500 basis-full">
              Pro Teilnehmer wird höchstens 1 Bescheinigung pro Tag (TN) bzw. 1 Zertifikat pro
              Kompetenzfeld angelegt — Duplikate werden übersprungen.
            </span>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              {canWrite && (
                <th className="w-8 text-center">
                  <input
                    type="checkbox"
                    id="cert-select-all"
                    className="h-4 w-4 accent-brand-600"
                  />
                  <script dangerouslySetInnerHTML={{ __html: `
                    document.getElementById('cert-select-all')?.addEventListener('change', function(e){
                      document.querySelectorAll('input[name="participantIds"]').forEach(function(c){ c.checked = e.target.checked; });
                    });
                  ` }} />
                </th>
              )}
              <th>Teilnehmer</th>
              <th>Tag</th>
              <th>Bescheinigungen</th>
              {canWrite && <th className="text-right">Einzeln</th>}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const tn = p.certificates.find((c) => c.type === "TEILNAHMEBESCHEINIGUNG");
              const dayBadge = p.dayOption === "DAY_1" ? "Tag 1" : p.dayOption === "DAY_2" ? "Tag 2" : "Beide Tage";
              const dayColor = p.dayOption === "BOTH"
                ? "bg-brand-100 text-brand-700"
                : p.dayOption === "DAY_1"
                ? "bg-amber-100 text-amber-800"
                : "bg-indigo-100 text-indigo-800";
              return (
                <tr key={p.id} className="align-top">
                  {canWrite && (
                    <td className="py-3 text-center">
                      <input
                        type="checkbox"
                        name="participantIds"
                        value={p.id}
                        form="cert-bulk-form"
                        className="h-4 w-4 accent-brand-600 mt-1"
                      />
                    </td>
                  )}
                  <td className="py-3">
                    <div className="font-medium text-sm">{p.dec.lastName}, {p.dec.firstName}</div>
                    <div className="text-xs font-mono text-slate-500">{p.dec.email}</div>
                    {p.dec.company && (
                      <div className="text-xs text-slate-500">{p.dec.company}</div>
                    )}
                  </td>
                  <td className="py-3">
                    <span className={`badge text-[11px] ${dayColor}`}>{dayBadge}</span>
                  </td>
                  <td className="py-3 space-y-2">
                    {p.certificates.length === 0 && (
                      <span className="text-xs text-slate-400 italic">noch keine</span>
                    )}
                    {p.certificates.map((c) => (
                      <CertRow key={c.id} cert={c} canWrite={canWrite} isAdmin={admin} />
                    ))}
                  </td>
                  {canWrite && (
                    <td className="py-3 text-right space-y-2">
                      {(() => {
                        const released = p.certificates.filter((c) => c.status === "RELEASED");
                        const unsent = released.filter((c) => !c.sentAt);
                        if (released.length === 0) return null;
                        return (
                          <form method="post" action={`/api/events/${ev.id}/certificates/send-participant`}>
                            <input type="hidden" name="participantId" value={p.id} />
                            <button
                              className={
                                "text-xs " +
                                (unsent.length > 0
                                  ? "text-brand-700 hover:underline"
                                  : "text-slate-400 cursor-not-allowed")
                              }
                              disabled={unsent.length === 0}
                              title={unsent.length === 0 ? "Alle bereits versendet" : ""}
                            >
                              📧 Alle freigegebenen senden ({unsent.length}/{released.length})
                            </button>
                          </form>
                        );
                      })()}
                      {!tn && (
                        <form method="post" action={`/api/events/${ev.id}/certificates/create`} className="inline-block">
                          <input type="hidden" name="participantId" value={p.id} />
                          <input type="hidden" name="type" value="TEILNAHMEBESCHEINIGUNG" />
                          <button className="text-xs text-brand-700 hover:underline">
                            + Teilnahmebescheinigung
                          </button>
                        </form>
                      )}
                      <details className="text-left">
                          <summary className="text-xs text-brand-700 hover:underline cursor-pointer list-none text-right">
                            + Zertifikat(e) (Kompetenzfelder wählen)
                          </summary>
                          <form
                            method="post"
                            action={`/api/events/${ev.id}/certificates/create`}
                            className="mt-2 p-3 border-2 border-brand-200 rounded-lg bg-brand-50/40 space-y-2"
                          >
                            <input type="hidden" name="participantId" value={p.id} />
                            <input type="hidden" name="type" value="ZERTIFIKAT" />
                            <div className="text-xs font-semibold text-slate-600">
                              Welche Kompetenzfelder bestätigen?
                            </div>
                            <div className="space-y-1 max-h-72 overflow-auto pr-1">
                              {kompetenzfelder.map((k) => (
                                <label key={k.id} className="flex items-start gap-2 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    name="kompetenz"
                                    value={k.id}
                                    defaultChecked={defaultK.has(k.id)}
                                    className="mt-0.5 h-3.5 w-3.5 accent-brand-600"
                                  />
                                  <span><span className="font-medium">{k.label}</span></span>
                                </label>
                              ))}
                            </div>
                            <button className="btn-primary text-xs px-3 py-1.5 w-full">
                              Zertifikat(e) anlegen
                            </button>
                            <p className="text-[10px] text-slate-500 mt-1">
                              Pro ausgewähltem Kompetenzfeld wird ein eigenes Zertifikat (eigene Nummer, eigene PDF) angelegt.
                            </p>
                          </form>
                        </details>
                    </td>
                  )}
                </tr>
              );
            })}
            {participants.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 5 : 3} className="text-center text-slate-500 py-8">
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
  isAdmin,
}: {
  cert: { id: string; number: string; slug: string; type: "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG"; status: "DRAFT" | "RELEASED" | "REVOKED"; sentAt: Date | null; sentTo: string | null };
  canWrite: boolean;
  isAdmin: boolean;
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
      <a href={`/api/certificates/${cert.id}/preview?bg=0`} target="_blank" className="text-brand-700 hover:underline">PDF (Briefpapier)</a>
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
      {isAdmin && cert.status === "REVOKED" && (
        <form method="post" action={`/api/certificates/${cert.id}/delete`} className="inline">
          <button className="text-rose-700 hover:underline">endgültig löschen</button>
        </form>
      )}
    </div>
  );
}
