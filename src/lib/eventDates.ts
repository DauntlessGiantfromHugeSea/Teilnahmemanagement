import type { Event } from "@prisma/client";

// Gibt alle Tagestermine eines Events als Date[] zurueck.
// Reihenfolge: day1Date, day2Date, dann extraDays (JSON-Array von YYYY-MM-DD).
export function getEventDates(
  ev: Pick<Event, "day1Date" | "day2Date" | "extraDays">
): Date[] {
  const out: Date[] = [];
  if (ev.day1Date) out.push(ev.day1Date);
  if (ev.day2Date) out.push(ev.day2Date);
  if (ev.extraDays) {
    try {
      const arr = JSON.parse(ev.extraDays);
      if (Array.isArray(arr)) {
        for (const s of arr) {
          if (typeof s === "string") {
            const d = new Date(s + "T00:00:00.000Z");
            if (!Number.isNaN(d.getTime())) out.push(d);
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return out;
}

// Anzahl Tage eines Events.
export function getEventDayCount(
  ev: Pick<Event, "day1Date" | "day2Date" | "extraDays">
): number {
  return getEventDates(ev).length;
}

// Letzter Tag (fuer Archiv-Pruefung).
export function getEventLastDate(
  ev: Pick<Event, "day1Date" | "day2Date" | "extraDays">
): Date | null {
  const ds = getEventDates(ev);
  return ds.length ? ds[ds.length - 1] : null;
}

// Formatiert die Termine als kompakten String, z.B.
//   "16.06.2026"
//   "16.06.2026 – 17.06.2026"
//   "18.03.2026, 19.03.2026, 20.03.2026"
export function formatEventDates(
  ev: Pick<Event, "day1Date" | "day2Date" | "extraDays">,
  opts: { long?: boolean } = {}
): string {
  const ds = getEventDates(ev);
  if (ds.length === 0) return "-";
  const fmt = (d: Date) =>
    opts.long
      ? d.toLocaleDateString("de-DE", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : d.toLocaleDateString("de-DE");
  if (ds.length === 1) return fmt(ds[0]);
  if (ds.length === 2) return `${fmt(ds[0])} – ${fmt(ds[1])}`;
  return ds.map(fmt).join(", ");
}

// Validates and serializes a list of YYYY-MM-DD strings to a JSON array.
export function serializeExtraDays(dates: (string | null | undefined)[]): string | null {
  const cleaned = dates
    .map((d) => (d ?? "").trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (cleaned.length === 0) return null;
  return JSON.stringify(cleaned);
}
