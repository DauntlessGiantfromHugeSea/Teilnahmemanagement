// Prueft die Zeitzonen-Umrechnung aus src/lib/timezone.ts.
// Reine Funktionen, keine Datenbank, kein Netz:
//   npx tsx scripts/test-timezone.ts
import {
  eventStartInstant,
  parseHhMm,
  timeZoneOffsetMs,
  zonedWallClockToUtc,
  formatDateTimeLocal,
} from "@/lib/timezone";

let fails = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       erwartet: ${want}\n       erhalten: ${got}`}`);
};

// --- Verschiebung Europe/Berlin ---
check("Winter = UTC+1", timeZoneOffsetMs(new Date("2026-01-15T12:00:00Z")) / 3600000, 1);
check("Sommer = UTC+2", timeZoneOffsetMs(new Date("2026-07-15T12:00:00Z")) / 3600000, 2);

// --- Wanduhrzeit -> echter Zeitpunkt ---
check("Sommer: 09:00 Ortszeit = 07:00 UTC",
  zonedWallClockToUtc(2026, 7, 15, 9, 0).toISOString(), "2026-07-15T07:00:00.000Z");
check("Winter: 09:00 Ortszeit = 08:00 UTC",
  zonedWallClockToUtc(2026, 11, 5, 9, 0).toISOString(), "2026-11-05T08:00:00.000Z");

// --- Umstellungstage 2026: 29.03. vor, 25.10. zurueck ---
check("Tag der Rueckstellung, 09:00 = 08:00 UTC",
  zonedWallClockToUtc(2026, 10, 25, 9, 0).toISOString(), "2026-10-25T08:00:00.000Z");
check("Tag davor, 09:00 = 07:00 UTC",
  zonedWallClockToUtc(2026, 10, 24, 9, 0).toISOString(), "2026-10-24T07:00:00.000Z");
check("Tag der Vorstellung, 09:00 = 07:00 UTC",
  zonedWallClockToUtc(2026, 3, 29, 9, 0).toISOString(), "2026-03-29T07:00:00.000Z");
check("Tag davor, 09:00 = 08:00 UTC",
  zonedWallClockToUtc(2026, 3, 28, 9, 0).toISOString(), "2026-03-28T08:00:00.000Z");
// 02:30 existiert am 29.03. nicht - darf nicht abstuerzen, muss etwas Sinnvolles liefern
const luecke = zonedWallClockToUtc(2026, 3, 29, 2, 30);
check("nicht existierende Stunde liefert gueltigen Zeitpunkt", Number.isNaN(luecke.getTime()), false);

// --- Veranstaltungsbeginn aus UTC-Mitternacht + "HH:MM" ---
const tagWinter = new Date("2026-11-05T00:00:00.000Z");
const tagSommer = new Date("2026-07-15T00:00:00.000Z");
check("Event Winter 09:00", eventStartInstant(tagWinter, "09:00").toISOString(), "2026-11-05T08:00:00.000Z");
check("Event Sommer 09:00", eventStartInstant(tagSommer, "09:00").toISOString(), "2026-07-15T07:00:00.000Z");
check("Event ohne Uhrzeit -> 09:00 angenommen",
  eventStartInstant(tagWinter, null).toISOString(), "2026-11-05T08:00:00.000Z");
check("Event mit Unsinn-Uhrzeit -> Rueckfall",
  eventStartInstant(tagWinter, "25:99").toISOString(), "2026-11-05T08:00:00.000Z");
check("Event 14:30", eventStartInstant(tagWinter, "14:30").toISOString(), "2026-11-05T13:30:00.000Z");

// --- parseHhMm ---
check("parseHhMm 09:00", JSON.stringify(parseHhMm("09:00")), '{"hour":9,"minute":0}');
check("parseHhMm 9:05", JSON.stringify(parseHhMm("9:05")), '{"hour":9,"minute":5}');
check("parseHhMm leer", parseHhMm(""), null);
check("parseHhMm Unsinn", parseHhMm("abc"), null);
check("parseHhMm 24:00 ungueltig", parseHhMm("24:00"), null);

// --- Anzeige ---
check("Anzeige in Ortszeit (Winter)",
  formatDateTimeLocal(new Date("2026-11-05T08:00:00.000Z")), "05.11.2026, 09:00");
check("Anzeige in Ortszeit (Sommer)",
  formatDateTimeLocal(new Date("2026-07-15T07:00:00.000Z")), "15.07.2026, 09:00");

// --- Die eigentliche Fachfrage: Vorlauf der Erinnerung ---
// Veranstaltung am 05.11.2026 um 09:00 Ortszeit. Faellig ist sie, sobald der
// Start hoechstens LEAD_HOURS entfernt ist - und noch nicht begonnen hat.
const LEAD = 24;
const start = eventStartInstant(tagWinter, "09:00");
const faellig = (jetzt: string) => {
  const ms = start.getTime() - new Date(jetzt).getTime();
  return ms > 0 && ms <= LEAD * 3600_000;
};
check("25h vorher: noch nicht faellig", faellig("2026-11-04T07:00:00Z"), false);
check("23h vorher: faellig",            faellig("2026-11-04T09:00:00Z"), true);
check("1h vorher: faellig",             faellig("2026-11-05T07:00:00Z"), true);
check("nach Beginn: nicht mehr",        faellig("2026-11-05T09:00:00Z"), false);
// Gegenprobe zur alten Logik: die haette am 03.11. gegen 19:00 Ortszeit ausgeloest
const altFrueh = new Date(tagWinter.getTime() - 30 * 3600_000); // 03.11. 18:00 UTC
const stundenVorher = (start.getTime() - altFrueh.getTime()) / 3600_000;
check("alte Logik lag bei 38 Stunden Vorlauf", stundenVorher, 38);

console.log(fails === 0 ? "\nALLE TESTS OK" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
