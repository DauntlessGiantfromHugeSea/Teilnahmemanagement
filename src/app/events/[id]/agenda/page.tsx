import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AgendaAdminPage({
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
    include: { agendaItems: { orderBy: [{ day: "asc" }, { position: "asc" }, { startTime: "asc" }] } },
  });
  if (!ev) notFound();
  const isTwoDay = !!(ev.day1Date && ev.day2Date);
  const day1 = ev.agendaItems.filter((i) => i.day === 1);
  const day2 = ev.agendaItems.filter((i) => i.day === 2);

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <div className="flex items-baseline flex-wrap justify-between gap-3 mb-2">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <a
          href={`/portal/${ev.id}`}
          target="_blank"
          className="text-sm text-brand-700 hover:underline"
        >
          Live-Ansicht öffnen ↗
        </a>
      </div>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Einträge der Schulungs-Agenda. Der zur aktuellen Uhrzeit laufende Punkt wird in der
        Live-Ansicht oben hervorgehoben. Reihenfolge über die Position-Nummer (kleinere Werte zuerst);
        bei gleicher Position entscheidet die Startzeit.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <DaySection
        day={1}
        items={day1}
        eventId={ev.id}
        canWrite={canWrite}
        title={isTwoDay ? "Tag 1" : "Programm"}
      />
      {isTwoDay && (
        <DaySection day={2} items={day2} eventId={ev.id} canWrite={canWrite} title="Tag 2" />
      )}
    </Shell>
  );
}

function DaySection({
  day, items, eventId, canWrite, title,
}: {
  day: number;
  items: { id: string; day: number; startTime: string; endTime: string | null; title: string; description: string | null; speaker: string | null; position: number }[];
  eventId: string;
  canWrite: boolean;
  title: string;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="space-y-2 mb-4">
        {items.map((it) => (
          <details key={it.id} className="card p-3">
            <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-xs text-slate-500">#{it.position}</span>
              <span className="font-mono text-sm text-brand-700">
                {it.startTime}{it.endTime ? `–${it.endTime}` : ""}
              </span>
              <span className="font-medium flex-1">{it.title}</span>
              {it.speaker && <span className="text-xs text-slate-500">{it.speaker}</span>}
              <span className="text-xs text-brand-700">bearbeiten</span>
            </summary>
            {canWrite && (
              <form
                method="post"
                action={`/api/events/${eventId}/agenda/update`}
                className="mt-3 pt-3 border-t border-slate-200 grid sm:grid-cols-[100px_100px_120px_1fr_120px_auto] gap-2 items-end"
              >
                <input type="hidden" name="id" value={it.id} />
                <div>
                  <label className="label">Start</label>
                  <input name="startTime" defaultValue={it.startTime} placeholder="09:00" className="input text-sm" required />
                </div>
                <div>
                  <label className="label">Ende</label>
                  <input name="endTime" defaultValue={it.endTime ?? ""} placeholder="10:30" className="input text-sm" />
                </div>
                <div>
                  <label className="label">Position</label>
                  <input name="position" type="number" defaultValue={it.position} className="input text-sm" />
                </div>
                <div>
                  <label className="label">Titel</label>
                  <input name="title" defaultValue={it.title} className="input text-sm" required />
                </div>
                <div>
                  <label className="label">Referent/in</label>
                  <input name="speaker" defaultValue={it.speaker ?? ""} className="input text-sm" />
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary text-xs px-3">Speichern</button>
                </div>
                <div className="sm:col-span-6">
                  <label className="label">Beschreibung (optional)</label>
                  <textarea name="description" defaultValue={it.description ?? ""} rows={2} className="input text-sm" />
                </div>
              </form>
            )}
            {canWrite && (
              <form method="post" action={`/api/events/${eventId}/agenda/delete`} className="mt-2 text-right">
                <input type="hidden" name="id" value={it.id} />
                <button className="text-xs text-rose-700 hover:underline">Eintrag löschen</button>
              </form>
            )}
          </details>
        ))}
        {items.length === 0 && (
          <div className="card p-4 text-sm text-slate-500 italic">Noch keine Einträge.</div>
        )}
      </div>
      {canWrite && (
        <details className="card p-3">
          <summary className="cursor-pointer text-sm text-brand-700 hover:underline">+ Neuer Eintrag</summary>
          <form method="post" action={`/api/events/${eventId}/agenda/create`} className="mt-3 grid sm:grid-cols-[100px_100px_120px_1fr_120px_auto] gap-2 items-end">
            <input type="hidden" name="day" value={day} />
            <div>
              <label className="label">Start</label>
              <input name="startTime" placeholder="09:00" required className="input text-sm" />
            </div>
            <div>
              <label className="label">Ende</label>
              <input name="endTime" placeholder="10:30" className="input text-sm" />
            </div>
            <div>
              <label className="label">Position</label>
              <input name="position" type="number" defaultValue={items.length * 10 + 10} className="input text-sm" />
            </div>
            <div>
              <label className="label">Titel</label>
              <input name="title" required className="input text-sm" />
            </div>
            <div>
              <label className="label">Referent/in</label>
              <input name="speaker" className="input text-sm" />
            </div>
            <div>
              <button className="btn-primary text-xs px-3">Anlegen</button>
            </div>
            <div className="sm:col-span-6">
              <label className="label">Beschreibung (optional)</label>
              <textarea name="description" rows={2} className="input text-sm" />
            </div>
          </form>
        </details>
      )}
    </section>
  );
}
