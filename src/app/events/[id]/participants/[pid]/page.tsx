import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent, isAccounting } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { safeDecrypt } from "@/lib/crypto";
import { ParticipantForm } from "@/components/ParticipantForm";
import { basePriceCents, finalPriceCents, formatEUR, formatPct } from "@/lib/pricing";

export default async function ParticipantDetail({
  params,
}: {
  params: { id: string; pid: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect("/events");

  const p = await prisma.participant.findUnique({
    where: { id: params.pid },
    include: {
      event: { include: { training: true } },
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      history: { include: { actor: true }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!p || p.eventId !== params.id) notFound();
  const dec = decryptParticipant(p);
  const canWrite = await canWriteEvent(s, p.eventId);
  const base = basePriceCents(p.event.training, p.dayOption);
  const final = finalPriceCents(base, p.discountBps);

  return (
    <Shell session={s} active="events">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs text-slate-500 uppercase">Teilnehmer</div>
          <h1 className="text-2xl font-semibold">{dec.firstName} {dec.lastName}</h1>
          <div className="text-sm text-slate-500">
            <a href={`/events/${p.eventId}`} className="hover:underline">{p.event.title}</a>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Endbetrag</div>
          <div className="text-xl font-semibold">{formatEUR(final)}</div>
          <div className="text-xs text-slate-500">
            {formatEUR(base)}{p.discountBps > 0 ? ` - ${formatPct(p.discountBps)}` : ""}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {canWrite ? (
            <section className="card p-6">
              <h2 className="font-semibold mb-4">Daten bearbeiten</h2>
              <ParticipantForm
                action={`/api/participants/${p.id}`}
                training={p.event.training}
                initial={{
                  firstName: dec.firstName,
                  lastName: dec.lastName,
                  email: dec.email,
                  phone: dec.phone,
                  company: dec.company,
                  street: dec.street,
                  zip: dec.zip,
                  city: dec.city,
                  country: dec.country,
                  notes: dec.notes,
                  dayOption: p.dayOption,
                  discountBps: p.discountBps,
                  status: p.status,
                }}
              />
            </section>
          ) : (
            <section className="card p-6">
              <h2 className="font-semibold mb-4">Daten</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Row label="Name" value={`${dec.firstName} ${dec.lastName}`} />
                <Row label="E-Mail" value={dec.email} />
                <Row label="Telefon" value={dec.phone} />
                <Row label="Firma" value={dec.company} />
                <Row label="Anschrift" value={[dec.street, [dec.zip, dec.city].filter(Boolean).join(" "), dec.country].filter(Boolean).join(", ")} />
                <Row label="Buchung" value={p.dayOption === "DAY_1" ? "Tag 1" : p.dayOption === "DAY_2" ? "Tag 2" : "Beide Tage"} />
                <Row label="Rabatt" value={formatPct(p.discountBps)} />
                <Row label="Notizen" value={dec.notes} />
              </dl>
            </section>
          )}

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Kommentare</h2>
            {canWrite && (
              <form method="post" action={`/api/participants/${p.id}/comments`} className="mb-4 space-y-2">
                <textarea name="body" required placeholder="Neuer Kommentar..." className="input" rows={3} />
                <button className="btn-primary text-sm">Kommentar hinzufuegen</button>
              </form>
            )}
            {p.comments.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Kommentare.</p>
            ) : (
              <ul className="space-y-3">
                {p.comments.map((c) => (
                  <li key={c.id} className="border-l-2 border-brand-200 pl-3">
                    <div className="text-xs text-slate-500">
                      {c.author.name} &middot; {c.createdAt.toLocaleString("de-DE")}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{safeDecrypt(c.body)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {(isAccounting(s) || canWrite) && (
            <section className="card p-6">
              <h2 className="font-semibold mb-4">Buchhaltung</h2>
              <form method="post" action={`/api/participants/${p.id}/invoice`} className="space-y-3">
                <div>
                  <label className="label">RE-Status</label>
                  <select name="invoiceStatus" defaultValue={p.invoiceStatus} className="input">
                    <option value="OPEN">offen</option>
                    <option value="ISSUED">gestellt</option>
                    <option value="PAID">bezahlt</option>
                    <option value="CANCELLED">storniert</option>
                  </select>
                </div>
                <div>
                  <label className="label">RE-Nummer</label>
                  <input name="invoiceNumber" defaultValue={p.invoiceNumber ?? ""} className="input" />
                </div>
                <div>
                  <label className="label">RE-Notizen</label>
                  <textarea name="invoiceNotes" rows={2} defaultValue={safeDecrypt(p.invoiceNotes) ?? ""} className="input" />
                </div>
                <button className="btn-primary text-sm w-full">Speichern</button>
              </form>
              <hr className="my-4" />
              <div className="text-xs text-slate-500 space-y-1">
                <div>Gestellt: {p.invoiceIssuedAt?.toLocaleString("de-DE") ?? "-"}</div>
                <div>Bezahlt: {p.invoicePaidAt?.toLocaleString("de-DE") ?? "-"}</div>
              </div>
            </section>
          )}

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Verlauf</h2>
            {p.history.length === 0 ? (
              <p className="text-sm text-slate-500">Keine Eintraege.</p>
            ) : (
              <ol className="space-y-2 text-xs">
                {p.history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-700">{h.action}</div>
                      <div className="text-slate-500">{h.actor?.name ?? "System"}</div>
                    </div>
                    <div className="text-slate-400 whitespace-nowrap">
                      {h.createdAt.toLocaleString("de-DE")}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{value || "-"}</dd>
    </div>
  );
}
