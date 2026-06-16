import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PortalIcon } from "@/components/PortalIcon";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function fmtDateLong(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

// Liefert die aktuellen Datums-/Zeit-Bestandteile in Europe/Berlin,
// unabhaengig davon, in welcher Timezone der Server laeuft (Container ist
// typischerweise UTC).
function berlinDateParts(): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? "0");
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"),
  };
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export default async function EventPortalPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { ok?: string; error?: string };
}) {
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      agendaItems: { orderBy: [{ day: "asc" }, { position: "asc" }] },
      portalBlocks: { where: { visible: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!ev) notFound();

  // 'Jetzt'-Berechnung explizit in Europe/Berlin - sonst kollidiert die
  // UTC-Server-Zeit mit der Agenda, die in Berliner Zeit gepflegt wird.
  const berlinNow = berlinDateParts();
  const nowMin = berlinNow.hour * 60 + berlinNow.minute;
  const today = new Date(berlinNow.year, berlinNow.month - 1, berlinNow.day).getTime();
  const d1 = ev.day1Date ? new Date(ev.day1Date) : null;
  const d2 = ev.day2Date ? new Date(ev.day2Date) : null;
  const d1day = d1 ? new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime() : null;
  const d2day = d2 ? new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime() : null;

  let activeDay: 1 | 2 | null = null;
  let nowState: "before" | "during" | "after" = "before";
  if (d1day && today === d1day) { activeDay = 1; nowState = "during"; }
  else if (d2day && today === d2day) { activeDay = 2; nowState = "during"; }
  else if ((d1day && today < d1day)) nowState = "before";
  else nowState = "after";

  let liveItem: typeof ev.agendaItems[number] | null = null;
  let isUpcoming = false;
  if (activeDay) {
    const todayItems = ev.agendaItems.filter((i) => i.day === activeDay);
    for (const it of todayItems) {
      const s = timeToMinutes(it.startTime);
      const e = timeToMinutes(it.endTime ?? null);
      if (s === null) continue;
      if (s <= nowMin && (e === null ? true : nowMin < e)) liveItem = it;
    }
    if (!liveItem) {
      const next = todayItems
        .map((it) => ({ it, m: timeToMinutes(it.startTime) }))
        .filter((x) => x.m !== null && (x.m as number) > nowMin)
        .sort((a, b) => (a.m as number) - (b.m as number))[0];
      liveItem = next?.it ?? null;
      isUpcoming = !!liveItem;
    }
  }

  const isTwoDay = !!(d1 && d2);
  const day1Items = ev.agendaItems.filter((i) => i.day === 1);
  const day2Items = ev.agendaItems.filter((i) => i.day === 2);
  const announcements = ev.portalBlocks.filter((b) => b.icon === "announcement");
  const otherBlocks = ev.portalBlocks.filter((b) => b.icon !== "announcement");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/30">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-2xl mx-auto px-4 pt-8 pb-8 sm:pt-10 sm:pb-10 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://fluessigbodenakademie.de/wp-content/uploads/2024/12/fba.png"
            alt="Flüssigboden Akademie"
            className="h-10 sm:h-11 w-auto mb-5"
          />
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider mb-3">
            Schulungs-Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{ev.title}</h1>
          <div className="mt-3 space-y-1.5 text-sm text-white/90">
            <div className="flex items-start gap-2">
              <span className="mt-0.5"><CalendarSvg /></span>
              <span className="leading-snug">
                {isTwoDay ? <>{fmtDateLong(d1)} <span className="opacity-70">und</span> {fmtDateLong(d2)}</> : fmtDateLong(d1)}
                {ev.startTime && ev.endTime && <> · {ev.startTime}–{ev.endTime} Uhr</>}
              </span>
            </div>
            {ev.location && (
              <div className="flex items-start gap-2">
                <span className="mt-0.5"><PortalIcon icon="location" className="text-white" /></span>
                <span className="leading-snug">{ev.location}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 space-y-5">
        {/* JETZT-Karte */}
        {liveItem && (
          <section className="relative rounded-2xl border border-brand-200 bg-white p-5 shadow-lg shadow-brand-900/5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold mb-2">
              {isUpcoming ? (
                <>
                  <span className="text-amber-600">Als Nächstes</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-600" />
                  </span>
                  <span className="text-brand-700">Jetzt</span>
                </>
              )}
              <span className="text-slate-400">·</span>
              <span className="font-mono text-slate-600">
                {liveItem.startTime}{liveItem.endTime ? `–${liveItem.endTime}` : ""}
                {isTwoDay && ` · Tag ${liveItem.day}`}
              </span>
            </div>
            <div className="text-xl font-bold text-slate-900 leading-snug">{liveItem.title}</div>
            {liveItem.speaker && (
              <div className="text-sm text-slate-600 mt-1">{liveItem.speaker}</div>
            )}
            {liveItem.description && (
              <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap leading-relaxed">{liveItem.description}</div>
            )}
          </section>
        )}

        {/* Ankuendigungen */}
        {announcements.length > 0 && (
          <section className="space-y-3">
            {announcements.map((b) => (
              <div key={b.id} className="rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-amber-700">
                  <PortalIcon icon="announcement" />
                  <span className="text-xs uppercase tracking-wider font-semibold">Ankündigung</span>
                </div>
                <div className="font-semibold text-slate-900">{b.title}</div>
                {b.body && <div className="text-sm text-slate-800 mt-1 whitespace-pre-wrap leading-relaxed">{b.body}</div>}
              </div>
            ))}
          </section>
        )}

        {/* Info-Karten (WLAN, Abendveranstaltung, ...) - ueber dem Programm */}
        {otherBlocks.length > 0 && (
          <section className="grid sm:grid-cols-2 gap-3">
            {otherBlocks.map((b) => (
              <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-1 text-brand-700">
                  <PortalIcon icon={b.icon} />
                  <span className="font-semibold text-slate-900">{b.title}</span>
                </div>
                {b.body && <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{b.body}</div>}
              </div>
            ))}
          </section>
        )}

        {/* Programm */}
        {ev.agendaItems.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Programm</h2>
              <span className="text-[11px] uppercase tracking-wider text-slate-400">
                {nowState === "before" ? "vor Beginn" : nowState === "after" ? "abgeschlossen" : "läuft"}
              </span>
            </div>
            <AgendaList items={day1Items} title={isTwoDay ? "Tag 1" : undefined} liveId={liveItem?.id ?? null} />
            {isTwoDay && (
              <div className="mt-5 pt-5 border-t border-slate-200">
                <AgendaList items={day2Items} title="Tag 2" liveId={liveItem?.id ?? null} />
              </div>
            )}
          </section>
        )}

        {/* Fragen-Box: nur Eingabe, keine Anzeige der bisherigen Fragen */}
        <section id="fragen" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-1">Frage an die Schulungsleitung</h2>
          <p className="text-xs text-slate-500 mb-3">
            Etwas unklar? Stell deine Frage hier — wir gehen im Verlauf der Schulung darauf ein.
          </p>
          {searchParams?.ok && (
            <div className="mb-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
              {searchParams.ok}
            </div>
          )}
          {searchParams?.error && (
            <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
              {searchParams.error}
            </div>
          )}
          <form method="post" action={`/api/portal/${ev.id}/questions`} className="space-y-2">
            <textarea
              name="text"
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              placeholder="Deine Frage …"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                name="name"
                maxLength={120}
                placeholder="Dein Name (optional)"
                className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700">
                Frage senden
              </button>
            </div>
          </form>
        </section>

        <footer className="pt-4 text-center text-xs text-slate-400">
          <p>Diese Seite aktualisiert sich automatisch alle 5 Minuten.</p>
          <p className="mt-2 uppercase tracking-wider">Flüssigboden Akademie</p>
        </footer>
      </div>

      {/* Seite reloaded automatisch alle 5 min, damit die JETZT-Markierung
          ohne manuellen Refresh nachzieht. */}
      <meta httpEquiv="refresh" content="300" />
    </main>
  );
}

function CalendarSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function AgendaList({
  items, title, liveId,
}: {
  items: { id: string; startTime: string; endTime: string | null; title: string; speaker: string | null; description: string | null }[];
  title?: string;
  liveId: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      {title && (
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</h3>
      )}
      <ol className="relative">
        {/* Timeline-Linie - laeuft durch die Mitte der Dots */}
        <div className="absolute left-[7px] top-3 bottom-3 w-px bg-slate-200" aria-hidden />
        {items.map((it) => {
          const isLive = liveId === it.id;
          return (
            <li key={it.id} className="relative pl-6 py-1.5 first:pt-0 last:pb-0">
              <div
                className={
                  "absolute left-0 top-3 w-3.5 h-3.5 rounded-full border-2 " +
                  (isLive ? "border-brand-600 bg-brand-500 ring-4 ring-brand-100" : "border-slate-300 bg-white")
                }
                aria-hidden
              />
              <div
                className={
                  "rounded-lg px-3 py-2 " +
                  (isLive ? "bg-brand-50 border border-brand-200" : "")
                }
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={"font-mono text-xs sm:text-sm shrink-0 tabular-nums " + (isLive ? "text-brand-700 font-semibold" : "text-slate-500")}>
                    {it.startTime}{it.endTime ? `–${it.endTime}` : ""}
                  </span>
                  <span className={"font-medium text-sm sm:text-base " + (isLive ? "text-slate-900" : "text-slate-800")}>{it.title}</span>
                </div>
                {it.speaker && <div className="text-xs text-slate-500 mt-0.5">{it.speaker}</div>}
                {it.description && (
                  <div className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap leading-relaxed">{it.description}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
