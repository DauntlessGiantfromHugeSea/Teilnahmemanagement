// Import historischer Zertifikate aus den aufbereiteten FBA-CSVs.
//
// Zwei separate Dateien (kommagetrennt oder Semikolon, UTF-8):
//
// (1) Zertifikate
//   ID; Zertifikatsnummer; Ausgestellt_am; Gueltig_bis; Nachname; Vorname;
//   Aussteller; Schulungsort; Schulungsleiter; Datum_Schulung;
//   Kompetenzfeld; Kopffeld; Bestaetigungstext; Bewertungstext
//
// (2) Teilnahmebescheinigungen
//   ID; Zertifikatsnummer; Ausgestellt_am; Nachname; Vorname; Firma;
//   Datum_Schulung; Schulungsort; Schulungsleiter; Praesenz_Online; Titel
//
// Regeln:
//   - Zeilen mit gesetzter Zertifikatsnummer werden 1:1 uebernommen.
//   - Zeilen ohne Nummer bekommen automatisch die naechste freie Nummer im
//     korrekten Format pro Typ (Z: JJ-INI-FBA/NNN; TN: JJ-TN-INI-JJ/NNN).
//   - Dubletten (gleiche Nummer schon in DB) werden uebersprungen.
//   - Status = RELEASED; participant = null (historische Daten).
//   - Nach dem Import wird der Counter pro Typ auf das gesehene Maximum
//     gehoben, damit kuenftige Vergaben nicht kollidieren.

import { prisma } from "./db";
import {
  buildCertificateNumber,
  numberToSlug,
  type CertificateData,
  type CertificateType,
} from "./certificateContent";
import { getCertTexts, bumpSequenceTo } from "./kompetenzfelder";

export interface ImportResult {
  zCount: number;
  tnCount: number;
  skipped: number;
  errors: string[];
}

function fmtDateShort(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function parseDate(s: string): Date | null {
  s = (s || "").trim();
  if (!s) return null;
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  // DD.MM.YYYY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  }
  // M/D/YY(YY)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
  }
  return null;
}

// Robuster CSV-Parser (UTF-8, Semikolon ODER Komma als Trennzeichen,
// doppelte Anfuehrungszeichen als Escape).
function parseCsv(text: string): string[][] {
  // BOM weg
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Trennzeichen sniffen: nimm das mit haeufigerem Vorkommen in der ersten Zeile.
  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const sep = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += c;
      }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\r") { /* ignore */ }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  // Leere Zeilen filtern
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

function header(headers: string[]): Map<string, number> {
  const m = new Map<string, number>();
  headers.forEach((h, i) => m.set(h.trim().toLowerCase(), i));
  return m;
}

function cell(row: string[], idx: number | undefined): string {
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

function initialsFor(lastName: string, firstName: string): { ln: string; fn: string } {
  const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  return {
    ln: strip(lastName).charAt(0).toUpperCase() || "X",
    fn: strip(firstName).charAt(0).toUpperCase() || "X",
  };
}

export async function importFromCsv(args: {
  zertifikateCsv?: string;
  teilnahmebescheinigungenCsv?: string;
  createdById: string;
}): Promise<ImportResult> {
  const texts = await getCertTexts();
  const result: ImportResult = { zCount: 0, tnCount: 0, skipped: 0, errors: [] };

  const usedNumbers = new Set<string>(
    (await prisma.certificate.findMany({ select: { number: true } })).map((c) => c.number)
  );

  // Max-NNN pro Typ tracken, damit wir Counter danach hochziehen
  let maxZ = -1;
  let maxTN = -1;

  // Naechste freie Nummer pro Typ, abgeleitet vom hoechsten in-DB Wert ohne
  // den Counter-Eintrag anzufassen (wir bumpen am Ende einmalig).
  async function autoNumberFor(type: CertificateType, year: number, ln: string, fn: string): Promise<string> {
    const seq = ((type === "ZERTIFIKAT" ? maxZ : maxTN) + 1);
    if (type === "ZERTIFIKAT") maxZ = seq; else maxTN = seq;
    return buildCertificateNumber({ year, type, firstName: fn, lastName: ln, sequence: seq });
  }

  // Bootstrap aus bestehender DB
  for (const c of await prisma.certificate.findMany({ select: { number: true, type: true } })) {
    const m = c.number.match(/\/(\d+)$/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n)) continue;
    if (c.type === "ZERTIFIKAT" && n > maxZ) maxZ = n;
    else if (c.type === "TEILNAHMEBESCHEINIGUNG" && n > maxTN) maxTN = n;
  }

  // --- Zertifikate ---
  if (args.zertifikateCsv) {
    const rows = parseCsv(args.zertifikateCsv);
    if (rows.length > 0) {
      const h = header(rows[0]);
      const promises: Promise<void>[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const lastName = cell(row, h.get("nachname"));
        const firstName = cell(row, h.get("vorname"));
        if (!lastName && !firstName) continue;
        const ausgestellt = parseDate(cell(row, h.get("ausgestellt_am")));
        const gueltig = parseDate(cell(row, h.get("gueltig_bis")));
        const datumSchulung = parseDate(cell(row, h.get("datum_schulung")));
        const schulungsort = cell(row, h.get("schulungsort"));
        const kompetenzfeld = cell(row, h.get("kompetenzfeld"));
        const bestaetigungstext = cell(row, h.get("bestaetigungstext"));
        const kopffeld = cell(row, h.get("kopffeld"));
        let number = cell(row, h.get("zertifikatsnummer"));
        const year = (ausgestellt ?? new Date()).getFullYear();
        if (!number) {
          // Initialen aus diesen Personennamen ableiten; fortlaufende NNN.
          number = await autoNumberFor("ZERTIFIKAT", year, lastName, firstName);
        } else {
          // Wenn die Nummer ein NNN hat, max aktualisieren, sonst manuelles Format akzeptieren.
          const m = number.match(/\/(\d+)$/);
          if (m) maxZ = Math.max(maxZ, parseInt(m[1], 10));
        }
        if (usedNumbers.has(number)) { result.skipped++; continue; }
        usedNumbers.add(number);

        const data: CertificateData = {
          firstName,
          lastName,
          eventTitle: kopffeld || "FBA-Schulung",
          trainingTitle: kompetenzfeld || "",
          eventDateLine: datumSchulung ? fmtDateShort(datumSchulung) : "",
          eventDateShort: datumSchulung ? fmtDateShort(datumSchulung) : "",
          location: schulungsort,
          texts,
          issuedDateShort: ausgestellt ? fmtDateShort(ausgestellt) : "",
          validUntilShort: gueltig ? fmtDateShort(gueltig) : "",
          kompetenzfeld: kompetenzfeld
            ? {
                id: kompetenzfeld.split(".")[0]?.trim() || "?",
                label: kompetenzfeld,
                text: bestaetigungstext,
              }
            : undefined,
        };

        const num = number;
        const row1 = r;
        promises.push(
          prisma.certificate
            .create({
              data: {
                number: num,
                slug: numberToSlug(num),
                participantId: null,
                type: "ZERTIFIKAT",
                status: "RELEASED",
                data: JSON.stringify(data),
                createdById: args.createdById,
                issuedAt: ausgestellt ?? undefined,
                releasedAt: ausgestellt ?? new Date(),
              },
            })
            .then(() => { result.zCount++; })
            .catch((e) => { result.errors.push(`Z Zeile ${row1 + 1}: ${e?.message ?? e}`); })
        );
      }
      await Promise.allSettled(promises);
    }
  }

  // --- Teilnahmebescheinigungen ---
  if (args.teilnahmebescheinigungenCsv) {
    const rows = parseCsv(args.teilnahmebescheinigungenCsv);
    if (rows.length > 0) {
      const h = header(rows[0]);
      const promises: Promise<void>[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const lastName = cell(row, h.get("nachname"));
        const firstName = cell(row, h.get("vorname"));
        if (!lastName && !firstName) continue;
        const ausgestellt = parseDate(cell(row, h.get("ausgestellt_am")));
        const datumSchulung = parseDate(cell(row, h.get("datum_schulung")));
        const company = cell(row, h.get("firma"));
        const schulungsort = cell(row, h.get("schulungsort"));
        const titel = cell(row, h.get("titel"));
        const po = cell(row, h.get("praesenz_online"));
        let number = cell(row, h.get("zertifikatsnummer"));
        const year = (ausgestellt ?? new Date()).getFullYear();
        if (!number) {
          number = await autoNumberFor("TEILNAHMEBESCHEINIGUNG", year, lastName, firstName);
        } else {
          const m = number.match(/\/(\d+)$/);
          if (m) maxTN = Math.max(maxTN, parseInt(m[1], 10));
        }
        if (usedNumbers.has(number)) { result.skipped++; continue; }
        usedNumbers.add(number);

        const data: CertificateData = {
          firstName,
          lastName,
          eventTitle: titel,
          trainingTitle: titel,
          eventDateLine: datumSchulung ? fmtDateShort(datumSchulung) : "",
          eventDateShort: datumSchulung ? fmtDateShort(datumSchulung) : "",
          location: schulungsort + (po ? ` (${po})` : ""),
          texts,
          issuedDateShort: ausgestellt ? fmtDateShort(ausgestellt) : "",
          validUntilShort: "",
          bodyText: company ? `Firma: ${company}` : undefined,
        };

        const num = number;
        const row1 = r;
        promises.push(
          prisma.certificate
            .create({
              data: {
                number: num,
                slug: numberToSlug(num),
                participantId: null,
                type: "TEILNAHMEBESCHEINIGUNG",
                status: "RELEASED",
                data: JSON.stringify(data),
                createdById: args.createdById,
                issuedAt: ausgestellt ?? undefined,
                releasedAt: ausgestellt ?? new Date(),
              },
            })
            .then(() => { result.tnCount++; })
            .catch((e) => { result.errors.push(`TN Zeile ${row1 + 1}: ${e?.message ?? e}`); })
        );
      }
      await Promise.allSettled(promises);
    }
  }

  // Counter pro Typ auf max+1 hochziehen
  if (maxZ >= 0) await bumpSequenceTo("ZERTIFIKAT", maxZ);
  if (maxTN >= 0) await bumpSequenceTo("TEILNAHMEBESCHEINIGUNG", maxTN);

  return result;
}
