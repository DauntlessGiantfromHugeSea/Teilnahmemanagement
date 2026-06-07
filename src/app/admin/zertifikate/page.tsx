import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { parseCertificateData } from "@/lib/certificates";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Entwurf",
  RELEASED: "freigegeben",
  REVOKED: "widerrufen",
};

export default async function ZertifikateUebersicht({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; type?: string; ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const where: any = {};
  if (searchParams.status && ["DRAFT", "RELEASED", "REVOKED"].includes(searchParams.status)) {
    where.status = searchParams.status;
  }
  if (searchParams.type && ["ZERTIFIKAT", "TEILNAHMEBESCHEINIGUNG"].includes(searchParams.type)) {
    where.type = searchParams.type;
  }

  const certs = await prisma.certificate.findMany({
    where,
    include: { participant: { include: { event: true } } },
    orderBy: { number: "desc" },
    take: 500,
  });

  // Klartext-Suche client-seitig auf entschluesselte Daten
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const rows = certs
    .map((c) => {
      const dec = c.participant ? decryptParticipant(c.participant) : null;
      const ev = c.participant?.event ?? null;
      // Fallback: importierte Zertifikate haben Name/Event nur im Snapshot.
      const snap = (() => {
        try { return parseCertificateData(c.data); } catch { return null; }
      })();
      const firstName = dec?.firstName ?? snap?.firstName ?? "";
      const lastName = dec?.lastName ?? snap?.lastName ?? "";
      const email = dec?.email ?? "";
      const eventTitle = ev?.title ?? snap?.eventTitle ?? "—";
      const eventId = ev?.id ?? null;
      return { c, firstName, lastName, email, eventTitle, eventId };
    })
    .filter(({ c, firstName, lastName, email, eventTitle }) => {
      if (!q) return true;
      const hay = `${c.number} ${firstName} ${lastName} ${email} ${eventTitle}`.toLowerCase();
      return hay.includes(q);
    });

  return (
    <Shell session={s} active="zertifikate">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-2xl font-semibold">Alle Zertifikate</h1>
        <Link href="/admin/zertifikate/import" className="btn-secondary text-sm">
          Excel-Import (historisch)
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Globale, fließende Liste aller jemals erzeugten Zertifikate und Teilnahmebescheinigungen,
        absteigend nach Nummer. Max. 500 Treffer.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <form method="get" className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Suche</label>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Name, E-Mail, Nummer, Event"
            className="input"
          />
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input">
            <option value="">alle</option>
            <option value="DRAFT">Entwurf</option>
            <option value="RELEASED">freigegeben</option>
            <option value="REVOKED">widerrufen</option>
          </select>
        </div>
        <div>
          <label className="label">Typ</label>
          <select name="type" defaultValue={searchParams.type ?? ""} className="input">
            <option value="">alle</option>
            <option value="ZERTIFIKAT">Zertifikat</option>
            <option value="TEILNAHMEBESCHEINIGUNG">Teilnahmebescheinigung</option>
          </select>
        </div>
        <button className="btn-secondary">Filtern</button>
      </form>

      <div className="text-xs text-slate-500 mb-2">{rows.length} Treffer</div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Typ</th>
              <th>Status</th>
              <th>Teilnehmer</th>
              <th>Veranstaltung</th>
              <th>Erstellt</th>
              <th className="text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, firstName, lastName, email, eventTitle, eventId }) => (
              <tr key={c.id} className="align-top">
                <td className="font-mono text-xs">{c.number}</td>
                <td className="text-xs">{c.type === "ZERTIFIKAT" ? "Zertifikat" : "TN"}</td>
                <td>
                  <span className={
                    "px-2 py-0.5 rounded-full text-xs font-semibold " +
                    (c.status === "RELEASED" ? "bg-emerald-100 text-emerald-700"
                      : c.status === "REVOKED" ? "bg-rose-100 text-rose-700"
                      : "bg-slate-100 text-slate-600")
                  }>{STATUS_LABEL[c.status]}</span>
                </td>
                <td className="text-sm">
                  <div className="font-medium">{lastName}, {firstName}</div>
                  {email && <div className="text-xs text-slate-500 font-mono">{email}</div>}
                </td>
                <td className="text-xs">
                  {eventId ? (
                    <Link href={`/events/${eventId}/certificates`} className="text-brand-700 hover:underline">
                      {eventTitle}
                    </Link>
                  ) : (
                    <span className="text-slate-500 italic">{eventTitle}</span>
                  )}
                </td>
                <td className="text-xs text-slate-500">
                  {new Date(c.createdAt).toLocaleDateString("de-DE")}
                </td>
                <td className="text-right text-xs space-x-2 whitespace-nowrap">
                  <a href={`/zertifikat/${c.slug}`} target="_blank" className="text-brand-700 hover:underline">Validierung</a>
                  <a href={`/api/certificates/${c.id}/preview`} target="_blank" className="text-brand-700 hover:underline">PDF</a>
                  {c.status === "RELEASED" && (
                    <form method="post" action={`/api/certificates/${c.id}/revoke`} className="inline">
                      <button className="text-rose-700 hover:underline" title="Validierung widerrufen">widerrufen</button>
                    </form>
                  )}
                  {c.status === "REVOKED" && (
                    <form method="post" action={`/api/certificates/${c.id}/delete`} className="inline">
                      <button className="text-rose-700 hover:underline" title="Endgültig aus der Datenbank löschen">löschen</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-8">Nichts gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
