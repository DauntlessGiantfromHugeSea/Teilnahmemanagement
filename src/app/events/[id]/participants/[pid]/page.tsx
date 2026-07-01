import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent, isAccounting } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { safeDecrypt } from "@/lib/crypto";
import { ParticipantForm } from "@/components/ParticipantForm";
import { DeleteParticipantButton } from "@/components/DeleteParticipantButton";
import { basePriceCents, finalPriceCents, formatEUR, formatPct } from "@/lib/pricing";

export default async function ParticipantDetail({
  params,
  searchParams,
}: {
  params: { id: string; pid: string };
  searchParams: { ok?: string; error?: string };
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
      tagLinks: { include: { tag: true } },
    },
  });
  const allTags = await prisma.tag.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
  if (!p || p.eventId !== params.id) notFound();
  const dec = decryptParticipant(p);
  const canWrite = await canWriteEvent(s, p.eventId);
  const base = basePriceCents(p.event.training, p.dayOption);
  const final = finalPriceCents(base, p.discountBps);

  // Andere Veranstaltungen für Umbuchung — alle nicht-abgesagten (inkl.
  // vergangener, damit Nachtragen in eine alte Schulung moeglich ist).
  const otherEvents = canWrite
    ? await prisma.event.findMany({
        where: { id: { not: p.eventId }, cancelled: false },
        orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
        include: { training: true },
        take: 400,
      })
    : [];

  return (
    <Shell session={s} active="events">
      {searchParams.ok && (
        <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>
      )}
      {searchParams.error && (
        <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>
      )}
      <div className="mb-4">
        <a
          href={`/events/${p.eventId}`}
          className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
        >
          ← Zurück zur Veranstaltung
        </a>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <span className="text-slate-500">Teilnehmer</span>
            {p.status === "CANCELLED" && (
              <span className="badge bg-red-100 text-red-700">storniert</span>
            )}
          </div>
          <h1 className={"text-2xl font-semibold " + (p.status === "CANCELLED" ? "line-through text-slate-400" : "")}>
            {dec.firstName} {dec.lastName}
          </h1>
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
          <div className="mt-3 flex flex-col gap-1 items-end">
            <a
              href={`/api/participants/${p.id}/anmeldebestaetigung`}
              target="_blank"
              className="text-xs text-brand-700 hover:underline"
              title="Wenn du eine Unterschrift im Konto hinterlegt hast, wird sie gestempelt — sonst Hinweis 'ohne Unterschrift gültig'"
            >
              Anmeldebestätigung (PDF)
            </a>
            <a
              href={`/events/${p.eventId}/participants/${p.id}/sign`}
              className="text-xs text-brand-700 hover:underline"
              title="Direkt im Browser digital unterschreiben"
            >
              … digital unterschreiben ✎
            </a>
            <a
              href={`/api/participants/${p.id}/anmeldebestaetigung?mode=digital`}
              target="_blank"
              className="text-xs text-slate-500 hover:text-brand-700 hover:underline"
              title="Ohne Unterschrift, mit Hinweis 'ohne Unterschrift gültig'"
            >
              … ohne Unterschrift
            </a>
            <a
              href={`/api/participants/${p.id}/anmeldebestaetigung?bg=0`}
              target="_blank"
              className="text-xs text-slate-500 hover:text-brand-700 hover:underline"
              title="Ohne Briefkopf — für Druck auf vorgedrucktes Briefpapier"
            >
              … für Briefpapier
            </a>
            {canWrite && (
              <div className="mt-2 pt-2 border-t border-slate-200 w-full">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1 text-right">
                  Per Mail an Teilnehmer
                </div>
                <form method="post" action={`/api/participants/${p.id}/anmeldebestaetigung/send`} className="flex flex-col gap-1 items-end">
                  <button name="mode" value="auto" className="text-xs text-brand-700 hover:underline">
                    📧 mit Unterschrift senden
                  </button>
                  <button name="mode" value="digital" className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
                    📧 ohne Unterschrift senden
                  </button>
                </form>
              </div>
            )}
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
            <h2 className="font-semibold mb-3">Tags / Kategorien</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {p.tagLinks.length === 0 && (
                <span className="text-xs text-slate-400 italic">Noch keine Tags vergeben.</span>
              )}
              {p.tagLinks.map((tl) => (
                <span
                  key={tl.tagId}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold"
                  style={{ background: (tl.tag.color ?? "#94a3b8") + "22", color: tl.tag.color ?? "#475569" }}
                  title={tl.autoAssigned ? "automatisch anhand der Firma vergeben" : "manuell vergeben"}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: tl.tag.color ?? "#94a3b8" }} />
                  {tl.tag.name}
                  {tl.autoAssigned && <span className="text-[10px] opacity-70">·auto</span>}
                  {canWrite && (
                    <form method="post" action={`/api/participants/${p.id}/tags`} className="inline ml-1">
                      <input type="hidden" name="action" value="remove" />
                      <input type="hidden" name="tagId" value={tl.tagId} />
                      <button className="hover:text-rose-700" title="Entfernen">×</button>
                    </form>
                  )}
                </span>
              ))}
            </div>
            {canWrite && (
              <form method="post" action={`/api/participants/${p.id}/tags`} className="flex items-center gap-2">
                <input type="hidden" name="action" value="add" />
                <select name="tagId" required className="input text-sm flex-1">
                  <option value="">+ Tag hinzufügen …</option>
                  {allTags
                    .filter((t) => !p.tagLinks.some((tl) => tl.tagId === t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
                <button className="btn-secondary text-sm">+ vergeben</button>
              </form>
            )}
          </section>

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Kommentare</h2>
            {canWrite && (
              <form method="post" action={`/api/participants/${p.id}/comments`} className="mb-4 space-y-2">
                <textarea name="body" required placeholder="Neuer Kommentar..." className="input" rows={3} />
                <button className="btn-primary text-sm">Kommentar hinzufügen</button>
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
          {canWrite && (
            <section className="card p-6">
              <h2 className="font-semibold mb-1">Status</h2>
              {p.status === "CANCELLED" ? (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    Diese Anmeldung ist storniert und wird in Anwesenheitslisten und
                    Buchhaltung nicht beruecksichtigt.
                  </p>
                  <form method="post" action={`/api/participants/${p.id}/cancel`} className="mb-2">
                    <input type="hidden" name="mode" value="reactivate" />
                    <button className="btn-secondary text-sm w-full">
                      Stornierung rueckgaengig
                    </button>
                  </form>
                  <DeleteParticipantButton
                    participantId={p.id}
                    name={`${dec.firstName} ${dec.lastName}`.trim() || dec.email}
                  />
                  <p className="text-[11px] text-slate-400 mt-2">
                    Endgueltiges Loeschen entfernt alle Daten aus der Datenbank.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    Storniert den Teilnehmer. Der Eintrag bleibt zur Nachvollziehbarkeit
                    sichtbar (durchgestrichen) - taucht aber nicht mehr in
                    Anwesenheitslisten oder der Buchhaltung auf.
                  </p>
                  <form method="post" action={`/api/participants/${p.id}/cancel`} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Begründung (optional, erscheint in der Mail)
                      </label>
                      <textarea
                        name="reason"
                        rows={2}
                        placeholder="z. B. Veranstaltung verschoben, anderer Termin angeboten …"
                        className="input text-sm"
                      />
                    </div>
                    <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4 accent-brand-600" />
                      <span>Teilnehmer per Mail über die Stornierung informieren</span>
                    </label>
                    <button className="btn-danger text-sm w-full">Stornieren</button>
                  </form>
                </>
              )}
            </section>
          )}

          {canWrite && otherEvents.length > 0 && p.status !== "CANCELLED" && (
            <section className="card p-6">
              <h2 className="font-semibold mb-1">Umbuchen</h2>
              <p className="text-xs text-slate-500 mb-3">
                Teilnehmer auf eine andere Veranstaltung verschieben. Falls die Ziel-
                Veranstaltung keine zwei Tage hat, wird die Buchung automatisch auf
                Tag&nbsp;1 gesetzt.
              </p>
              <form method="post" action={`/api/participants/${p.id}/move`} className="space-y-3">
                <div>
                  <label className="label">Ziel-Veranstaltung</label>
                  <select name="targetEventId" required className="input">
                    <option value="" disabled>Bitte wählen</option>
                    {otherEvents.map((e) => {
                      const last = e.day2Date ?? e.day1Date;
                      const past = last ? last.getTime() < Date.now() : false;
                      const label = `${past ? "[Archiv] " : ""}${e.title}${e.day1Date ? ` - ${e.day1Date.toLocaleDateString("de-DE")}` : ""}`;
                      return (
                        <option key={e.id} value={e.id}>{label}</option>
                      );
                    })}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Vergangene Schulungen sind mit „[Archiv]" markiert und können für nachträgliche Eintragungen gewählt werden.
                  </p>
                </div>
                <div>
                  <label className="label">Begründung (optional, erscheint in der Mail)</label>
                  <textarea name="reason" rows={2} placeholder="z. B. neuer Termin auf Wunsch des Teilnehmers" className="input text-sm" />
                </div>
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4 accent-brand-600" />
                  <span>Teilnehmer per Mail über die Umbuchung informieren</span>
                </label>
                <button className="btn-primary text-sm w-full">Umbuchen</button>
              </form>
            </section>
          )}

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
              <p className="text-sm text-slate-500">Keine Einträge.</p>
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
