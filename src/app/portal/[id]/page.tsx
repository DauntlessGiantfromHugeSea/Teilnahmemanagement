import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// Live-Daten - alle 30s automatisch aktualisieren, damit der laufende Punkt
// auf Teilnehmer-Phones up-to-date bleibt ohne manuelles Reload.
export const revalidate = 0;

function fmtDateLong(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export default async function EventPortalPage({ params }: { params: { id: string } }) {
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      agendaItems: { orderBy: [{ day: "asc" }, { position: "asc" }, { startTime: "asc" }] },
    },
  });
  if (!ev) notFound();

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d1 = ev.day1Date ? new Date(ev.day1Date) : null;
  const d2 = ev.day2Date ? new Date(ev.day2Date) : null;
  const d1day = d1 ? new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime() : null;
  const d2day = d2 ? new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime() : null;

  // Welcher Schulungstag laeuft gerade?
  let activeDay: 1 | 2 | null = null;
  if (d1day && today === d1day) activeDay = 1;
  else if (d2day && today === d2day) activeDay = 2;

  // Aktuell laufender Eintrag (am aktiven Tag, Startzeit erreicht und Endzeit
  // noch nicht ueberschritten - bzw. der zuletzt begonnene Eintrag wenn keine
  // Endzeit gesetzt ist).
  let liveItem: typeof ev.agendaItems[number] | null = null;
  if (activeDay) {
    const today2 = ev.agendaItems.filter((i) => i.day === activeDay);
    for (const it of today2) {
      const s = timeToMinutes(it.startTime);
      const e = timeToMinutes(it.endTime ?? null);
      if (s === null) continue;
      if (s <= nowMin && (e === null ? true : nowMin < e)) {
        liveItem = it;
      }
    }
    // Wenn kein laufender, naechsten kommenden zeigen
    if (!liveItem) {
      const next = today2
        .map((it) => ({ it, m: timeToMinutes(it.startTime) }))
        .filter((x) => x.m !== null && (x.m as number) > nowMin)
        .sort((a, b) => (a.m as number) - (b.m as number))[0];
      liveItem = next?.it ?? null;
    }
  }

  const isTwoDay = !!(d1 && d2);
  const day1Items = ev.agendaItems.filter((i) => i.day === 1);
  const day2Items = ev.agendaItems.filter((i) => i.day === 2);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-fba.png" alt="FB-Akademie" className="h-10 w-auto mb-6" />

        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-slate-500">Schulungs-Portal</div>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">{ev.title}</h1>
          <div className="text-sm text-slate-600 mt-1">
            {isTwoDay
              ? `${fmtDateLong(d1)} und ${fmtDateLong(d2)}`
              : fmtDateLong(d1)}
            {ev.startTime && ev.endTime && (
              <> · {ev.startTime}–{ev.endTime} Uhr</>
            )}
          </div>
          {ev.location && <div className="text-sm text-slate-600">{ev.location}</div>}
        </div>

        {liveItem && (
          <section className="mb-6 rounded-2xl border-2 border-brand-500 bg-brand-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-brand-700 font-semibold mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-600" />
              </span>
              {activeDay && nowMin < (timeToMinutes(liveItem.startTime) ?? 0)
                ? "Als Nächstes"
                : "Jetzt"}
            </div>
            <div className="font-mono text-sm text-brand-700 mb-1">
              {liveItem.startTime}{liveItem.endTime ? `–${liveItem.endTime}` : ""}
              {isTwoDay && ` · Tag ${liveItem.day}`}
            </div>
            <div className="text-lg font-semibold text-slate-900">{liveItem.title}</div>
            {liveItem.speaker && (
              <div className="text-sm text-slate-600 mt-1">{liveItem.speaker}</div>
            )}
            {liveItem.description && (
              <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{liveItem.description}</div>
            )}
          </section>
        )}

        <h2 className="text-lg font-semibold mb-3">Programm</h2>
        {ev.agendaItems.length === 0 ? (
          <div className="text-sm text-slate-500 italic">Die Agenda wird noch eingepflegt.</div>
        ) : (
          <>
            <AgendaList items={day1Items} title={isTwoDay ? "Tag 1" : undefined} liveId={liveItem?.id ?? null} />
            {isTwoDay && (
              <div className="mt-6">
                <AgendaList items={day2Items} title="Tag 2" liveId={liveItem?.id ?? null} />
              </div>
            )}
          </>
        )}

        <p className="mt-10 text-xs text-slate-400 text-center">
          Diese Seite aktualisiert sich automatisch.
        </p>
      </div>
      {/* Auto-Refresh: alle 30 Sekunden neu laden */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <meta httpEquiv="refresh" content="30" />
    </main>
  );
}

function AgendaList({
  items, title, liveId,
}: {
  items: { id: string; startTime: string; endTime: string | null; title: string; speaker: string | null; description: string | null }[];
  title?: string;
  liveId: string | null;
}) {
  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</h3>}
      <ol className="space-y-2">
        {items.map((it) => {
          const isLive = liveId === it.id;
          return (
            <li
              key={it.id}
              className={
                "rounded-xl border p-3 sm:p-4 " +
                (isLive
                  ? "border-brand-400 bg-brand-50/60"
                  : "border-slate-200 bg-white")
              }
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm text-brand-700 shrink-0">
                  {it.startTime}{it.endTime ? `–${it.endTime}` : ""}
                </span>
                <span className="font-medium text-slate-900">{it.title}</span>
              </div>
              {it.speaker && <div className="text-xs text-slate-500 mt-1">{it.speaker}</div>}
              {it.description && (
                <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{it.description}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
