// Zeitzonen-Hilfen.
//
// Die Anwendung laeuft fachlich in deutscher Zeit. Damit das unabhaengig
// davon stimmt, wie der Container konfiguriert ist, rechnen die Funktionen
// hier ausdruecklich gegen eine benannte Zeitzone (Default Europe/Berlin)
// statt gegen die Server-Zeitzone.
//
// Hintergrund zur Datenhaltung:
//   - Veranstaltungstage (day1Date, day2Date) liegen als UTC-Mitternacht in
//     der DB. Sie bezeichnen einen Kalendertag, keinen Zeitpunkt.
//   - Uhrzeiten (startTime, endTime) sind reine "HH:MM"-Zeichenketten in
//     Ortszeit. Sie verschieben sich bei der Zeitumstellung nicht.
//
// Der echte Startzeitpunkt einer Veranstaltung ergibt sich also erst aus der
// Kombination beider Felder - und der haengt an der Zeitzone, weil zwischen
// Sommer- und Winterzeit eine Stunde Unterschied liegt.

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Berlin";

/**
 * Verschiebung der Zeitzone gegenueber UTC zum gegebenen Zeitpunkt, in
 * Millisekunden. Beruecksichtigt Sommer-/Winterzeit automatisch, weil die
 * Auskunft fuer genau diesen Zeitpunkt eingeholt wird.
 */
export function timeZoneOffsetMs(at: Date, timeZone: string = APP_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asIfUtc - at.getTime();
}

/**
 * Wandelt eine Ortszeit-Angabe (Wanduhr) in den tatsaechlichen Zeitpunkt um.
 *
 * Beispiel: 5. November 2026, 09:00 Uhr deutscher Zeit -> 08:00 UTC.
 * Im Sommer ergaebe dieselbe Wanduhrzeit 07:00 UTC.
 *
 * Zweistufig, weil die Verschiebung selbst vom Ergebnis abhaengt: Die erste
 * Schaetzung deutet die Wanduhrzeit als UTC, die zweite korrigiert mit der
 * dann tatsaechlich geltenden Verschiebung. Das faengt auch die beiden
 * Umstellungsnaechte ab.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string = APP_TIMEZONE
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = timeZoneOffsetMs(new Date(guess), timeZone);
  let ts = guess - firstOffset;
  const secondOffset = timeZoneOffsetMs(new Date(ts), timeZone);
  if (secondOffset !== firstOffset) ts = guess - secondOffset;
  return new Date(ts);
}

/** Parst "HH:MM" bzw. "H:MM". Gibt null zurueck, wenn das Format nicht passt. */
export function parseHhMm(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Tatsaechlicher Startzeitpunkt einer Veranstaltung.
 *
 * `day` ist der als UTC-Mitternacht gespeicherte Kalendertag, `startTime` die
 * Ortszeit als "HH:MM". Fehlt die Uhrzeit, wird `fallbackHour` in Ortszeit
 * angenommen (Default 9 Uhr) - sonst laege der Start rechnerisch mitten in
 * der Nacht und jede Frist davor waere falsch.
 */
export function eventStartInstant(
  day: Date,
  startTime: string | null | undefined,
  fallbackHour = 9,
  timeZone: string = APP_TIMEZONE
): Date {
  const hm = parseHhMm(startTime) ?? { hour: fallbackHour, minute: 0 };
  return zonedWallClockToUtc(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    hm.hour,
    hm.minute,
    timeZone
  );
}

/** Datum und Uhrzeit in deutscher Schreibweise, immer in APP_TIMEZONE. */
export function formatDateTimeLocal(d: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Nur das Datum, immer in APP_TIMEZONE. */
export function formatDateLocal(d: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
