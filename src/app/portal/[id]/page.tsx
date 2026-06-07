import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
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

const ICONS: Record<string, string> = {
  announcement: "📣",
  wifi: "📶",
  food: "🍽",
  evening: "🌙",
  location: "📍",
  contact: "☎",
  info: "ℹ️",
  warning: "⚠️",
};

export default async function EventPortalPage({ params }: { params: { id: string } }) {
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      agendaItems: { orderBy: [{ day: "asc" }, { position: "asc" }] },
      portalBlocks: { where: { visible: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
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
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-16 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="FB-Akademie" className="h-9 w-auto mb-6 bg-white/95 rounded-lg p-1.5 shadow inline-block" />
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold uppercase tracking-wide mb-3">
            Schulungs-Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight drop-shadow-sm">{ev.title}</h1>
          <div className="mt-4 space-y-1 text-sm text-white/90">
            <div className="flex items-center gap-2">
              <span aria-hidden>📅</span>
              <span>
                {isTwoDay ? <>{fmtDateLong(d1)} <span className="opacity-70">und</span> {fmtDateLong(d2)}</> : fmtDateLong(d1)}
                {ev.startTime && ev.endTime && <> · {ev.startTime}–{ev.endTime} Uhr</>}
              </span>
            </div>
            {ev.location && (
              <div className="flex items-center gap-2">
                <span aria-hidden>📍</span>
                <span>{ev.location}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 -mt-10 pb-12 space-y-6">
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
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xl leading-none">📣</span>
                  <span className="text-xs uppercase tracking-wider font-semibold text-amber-700">Ankündigung</span>
                </div>
                <div className="font-semibold text-slate-900">{b.title}</div>
                {b.body && <div className="text-sm text-slate-800 mt-1 whitespace-pre-wrap leading-relaxed">{b.body}</div>}
              </div>
            ))}
          </section>
        )}

        {/* Programm */}
        {ev.agendaItems.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Programm</h2>
              <span className="text-xs text-slate-400">
                {nowState === "before" ? "vor Beginn" : nowState === "after" ? "abgeschlossen" : "läuft"}
              </span>
            </div>
            <AgendaList items={day1Items} title={isTwoDay ? "Tag 1" : undefined} liveId={liveItem?.id ?? null} />
            {isTwoDay && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <AgendaList items={day2Items} title="Tag 2" liveId={liveItem?.id ?? null} />
              </div>
            )}
          </section>
        )}

        {/* Info-Karten (WLAN, Abendveranstaltung, ...) */}
        {otherBlocks.length > 0 && (
          <section className="grid sm:grid-cols-2 gap-3">
            {otherBlocks.map((b) => (
              <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xl leading-none">{ICONS[b.icon ?? ""] ?? "•"}</span>
                  <span className="font-semibold text-slate-900">{b.title}</span>
                </div>
                {b.body && <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{b.body}</div>}
              </div>
            ))}
          </section>
        )}

        <footer className="pt-4 text-center text-xs text-slate-400">
          <p>Diese Seite aktualisiert sich automatisch alle 30 Sekunden.</p>
          <p className="mt-2 uppercase tracking-wider">Flüssigboden Akademie</p>
        </footer>
      </div>

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
  if (items.length === 0) return null;
  return (
    <div>
      {title && (
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</h3>
      )}
      <ol className="relative space-y-1">
        <div className="absolute left-[40px] top-2 bottom-2 w-px bg-slate-200" aria-hidden />
        {items.map((it) => {
          const isLive = liveId === it.id;
          return (
            <li key={it.id} className="relative pl-12">
              <div
                className={
                  "absolute left-[34px] top-3 w-3.5 h-3.5 rounded-full border-2 " +
                  (isLive ? "border-brand-600 bg-brand-500 ring-4 ring-brand-100" : "border-slate-300 bg-white")
                }
                aria-hidden
              />
              <div
                className={
                  "rounded-xl px-3 py-2 " +
                  (isLive ? "bg-brand-50 border border-brand-200" : "hover:bg-slate-50")
                }
              >
                <div className="flex items-baseline gap-2">
                  <span className={"font-mono text-sm shrink-0 " + (isLive ? "text-brand-700 font-semibold" : "text-slate-500")}>
                    {it.startTime}{it.endTime ? `–${it.endTime}` : ""}
                  </span>
                  <span className={"font-medium " + (isLive ? "text-slate-900" : "text-slate-800")}>{it.title}</span>
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
