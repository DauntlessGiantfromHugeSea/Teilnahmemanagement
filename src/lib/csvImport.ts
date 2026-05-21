import { prisma } from "./db";
import { encryptField, blindIndex } from "./crypto";
import { DayOption, EventFormat, Prisma } from "@prisma/client";

// Minimaler RFC-4180-Parser. Unterstützt:
// - Felder in Anführungszeichen mit eingebetteten Zeilenumbrüchen
// - Doppelte Anführungszeichen als Escape ("")
// - Komma als Trennzeichen
export function parseCsv(input: string): string[][] {
  // BOM entfernen
  let s = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // ignorieren - \r\n wird durch das folgende \n abgeschlossen
      } else {
        field += c;
      }
    }
  }
  // letzte Zeile
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Parser für das training-date Feld, z.B.:
// "16.06.2026 - 17.06.2026 Basisschulung + Technologieschulung 'Geoponton und Fernwärme' (ID: #260603)"
// "18.03.2026 Basisschulung (ID: #260301)"
// "17.06.2026 Technologieschulung 'Geoponton und Fernwärme' (ID: #260602)"
export interface ParsedTrainingDate {
  externalId: string | null; // "#260603"
  day1Date: Date | null;
  day2Date: Date | null;
  trainingTitle: string; // z.B. "Geoponton und Fernwärme" oder "Basisschulung"
  eventTitle: string; // beschreibender Titel für das Event
  hasBasis: boolean;
  hasTechno: boolean;
}

function parseDdMmYyyy(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function parseTrainingDate(raw: string): ParsedTrainingDate {
  const idMatch = raw.match(/ID:\s*#?(\d+)/i);
  const externalId = idMatch ? `#${idMatch[1]}` : null;

  // Datum/Daten am Anfang extrahieren
  const dateRangeMatch = raw.match(/^(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
  const singleDateMatch = raw.match(/^(\d{2}\.\d{2}\.\d{4})/);
  let day1Date: Date | null = null;
  let day2Date: Date | null = null;
  if (dateRangeMatch) {
    day1Date = parseDdMmYyyy(dateRangeMatch[1]);
    day2Date = parseDdMmYyyy(dateRangeMatch[2]);
  } else if (singleDateMatch) {
    day1Date = parseDdMmYyyy(singleDateMatch[1]);
  }

  const hasBasis = /Basisschulung/i.test(raw);
  const hasTechno = /Technologieschulung/i.test(raw);
  const titleMatch = raw.match(/Technologieschulung\s*['"]([^'"]+)['"]/i);
  const topic = titleMatch ? titleMatch[1].trim() : null;

  let trainingTitle: string;
  if (topic) {
    trainingTitle = hasBasis ? `Basis + Technologie: ${topic}` : `Technologie: ${topic}`;
  } else if (hasBasis) {
    trainingTitle = "Basisschulung";
  } else {
    trainingTitle = "Schulung";
  }

  const dateLabel = day1Date
    ? day2Date
      ? `${day1Date.toLocaleDateString("de-DE")} - ${day2Date.toLocaleDateString("de-DE")}`
      : day1Date.toLocaleDateString("de-DE")
    : "";
  const eventTitle = dateLabel ? `${trainingTitle} (${dateLabel})` : trainingTitle;

  return { externalId, day1Date, day2Date, trainingTitle, eventTitle, hasBasis, hasTechno };
}

export function deriveDayOption(d: ParsedTrainingDate): DayOption {
  if (d.day1Date && d.day2Date) return "BOTH";
  if (d.hasBasis && !d.hasTechno) return "DAY_1";
  if (d.hasTechno && !d.hasBasis) return "DAY_2";
  return "DAY_1";
}

// "Müller, Max" -> { firstName: "Max", lastName: "Müller" }
// "Max Müller"  -> { firstName: "Max", lastName: "Müller" }
// "Dipl.-Ing. Max Müller" -> { firstName: "Max", lastName: "Müller" } (best effort)
export function splitName(raw: string): { firstName: string; lastName: string } {
  const s = raw.trim();
  if (!s) return { firstName: "", lastName: "" };
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2).map((x) => x.trim());
    return { firstName: first ?? "", lastName: last ?? "" };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  // Letztes Wort als Nachname, Rest als Vorname (verzichten auf Titel-Erkennung)
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

// Phone bereinigen: Contact Form 7 prefix "(Sicherheitswarnung: ...) +49..." entfernen
export function cleanPhone(raw: string): string {
  const m = raw.match(/Sicherheitswarnung:.*?\)\s*(.*)$/s);
  const cleaned = (m ? m[1] : raw).trim();
  return cleaned;
}

// Gemeinsame Eingabestruktur für CSV-Zeilen und Webhook-Payloads
export interface AnmeldungInput {
  participantName: string;
  companyName?: string;
  participantEmail: string;
  phone?: string;
  trainingDate: string;
  billingCompany?: string;
  billingName?: string;
  billingStreet?: string;
  billingZipCity?: string;
  billingEmail?: string;
  remarks?: string;
}

export interface CreatedAnmeldung {
  status: "created" | "duplicate";
  participantId: string;
  eventId: string;
  message: string;
}

export async function createAnmeldung(
  input: AnmeldungInput,
  ctx: { actorId: string }
): Promise<CreatedAnmeldung> {
  if (!input.participantEmail || !input.participantName) {
    throw new Error("Name oder E-Mail fehlt");
  }
  const parsed = parseTrainingDate(input.trainingDate ?? "");
  if (!parsed.externalId) {
    throw new Error("Keine Event-ID in training-date erkennbar");
  }

  let event = await prisma.event.findUnique({ where: { externalId: parsed.externalId } });
  if (!event) {
    let training = await prisma.training.findFirst({ where: { title: parsed.trainingTitle } });
    if (!training) {
      training = await prisma.training.create({
        data: { title: parsed.trainingTitle, priceDay1: 0, priceDay2: 0, priceBoth: 0 },
      });
    }
    event = await prisma.event.create({
      data: {
        externalId: parsed.externalId,
        trainingId: training.id,
        title: parsed.eventTitle,
        format: "PRESENCE",
        day1Date: parsed.day1Date,
        day2Date: parsed.day2Date,
        createdById: ctx.actorId,
      },
    });
  }

  const { firstName, lastName } = splitName(input.participantName);
  const phone = cleanPhone(input.phone ?? "");
  const dayOption = deriveDayOption(parsed);
  const emailLc = input.participantEmail.trim().toLowerCase();
  const emailHash = blindIndex(emailLc);

  const dup = await prisma.participant.findFirst({ where: { eventId: event.id, emailHash } });
  if (dup) {
    return {
      status: "duplicate",
      participantId: dup.id,
      eventId: event.id,
      message: "Bereits vorhanden (gleiche E-Mail im Event)",
    };
  }

  const data: Prisma.ParticipantUncheckedCreateInput = {
    eventId: event.id,
    firstName: encryptField(firstName) ?? "",
    lastName: encryptField(lastName) ?? "",
    email: encryptField(emailLc) ?? "",
    emailHash,
    phone: encryptField(phone || null),
    company: encryptField(input.companyName ?? null),
    notes: encryptField(input.remarks ?? null),
    billingCompany: encryptField(input.billingCompany ?? null),
    billingName: encryptField(input.billingName ?? null),
    billingStreet: encryptField(input.billingStreet ?? null),
    billingZipCity: encryptField(input.billingZipCity ?? null),
    billingEmail: encryptField(input.billingEmail ?? null),
    dayOption,
  };
  const p = await prisma.participant.create({ data });
  return { status: "created", participantId: p.id, eventId: event.id, message: "Angelegt" };
}

export interface ImportRowResult {
  row: number;
  ok: boolean;
  message: string;
  participantId?: string;
  eventId?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: ImportRowResult[];
}

interface RowAnmeldung {
  participantName: string;
  companyName: string;
  participantEmail: string;
  phone: string;
  trainingDate: string;
  billingCompany: string;
  billingName: string;
  billingStreet: string;
  billingZipCity: string;
  billingEmail: string;
  remarks: string;
}

function toRowAnmeldung(headers: string[], row: string[]): RowAnmeldung {
  const idx = (h: string) => headers.findIndex((x) => x === h);
  const get = (h: string) => {
    const i = idx(h);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };
  return {
    participantName: get("participant-name"),
    companyName: get("company-name"),
    participantEmail: get("participant-email"),
    phone: get("phone-number"),
    trainingDate: get("training-date"),
    billingCompany: get("billing-company-name"),
    billingName: get("billing-name"),
    billingStreet: get("billing-street"),
    billingZipCity: get("billing-zipcode-city"),
    billingEmail: get("billing-email"),
    remarks: get("remarks"),
  };
}

export async function importAnmeldungenCsv(
  csv: string,
  ctx: { actorId: string }
): Promise<ImportSummary> {
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return { total: 0, created: 0, skipped: 0, failed: 0, results: [] };
  }
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const summary: ImportSummary = {
    total: dataRows.length,
    created: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2; // Header = Zeile 1
    try {
      const r = toRowAnmeldung(headers, dataRows[i]);
      const res = await createAnmeldung(r, ctx);
      if (res.status === "duplicate") {
        summary.skipped++;
      } else {
        summary.created++;
      }
      summary.results.push({
        row: rowNum,
        ok: true,
        message: res.message,
        participantId: res.participantId,
        eventId: res.eventId,
      });
    } catch (e: any) {
      summary.failed++;
      summary.results.push({ row: rowNum, ok: false, message: `Fehler: ${e?.message ?? e}` });
    }
  }
  return summary;
}

interface RowSimpleKontakt {
  name: string;
  firma: string;
  straße: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  emailRechnung: string;
  kostenstelle: string;
}

function toRowSimple(headers: string[], row: string[]): RowSimpleKontakt {
  const idx = (h: string) => headers.findIndex((x) => x === h);
  const get = (h: string) => {
    const i = idx(h);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };
  return {
    name: get("nachname-vorname"),
    firma: get("firma"),
    straße: get("straße"),
    plz: get("plz"),
    ort: get("ort"),
    telefon: get("telefon"),
    email: get("email"),
    emailRechnung: get("email-rechnung"),
    kostenstelle: get("kostenstelle"),
  };
}

export async function importKontakteCsv(
  csv: string,
  ctx: { eventId: string }
): Promise<ImportSummary> {
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return { total: 0, created: 0, skipped: 0, failed: 0, results: [] };
  }
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const summary: ImportSummary = {
    total: dataRows.length,
    created: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  const event = await prisma.event.findUnique({ where: { id: ctx.eventId } });
  if (!event) {
    return { ...summary, failed: dataRows.length, results: [{ row: 0, ok: false, message: "Event nicht gefunden" }] };
  }

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2;
    try {
      const r = toRowSimple(headers, dataRows[i]);
      if (!r.email || !r.name) {
        summary.failed++;
        summary.results.push({ row: rowNum, ok: false, message: "Name oder E-Mail fehlt" });
        continue;
      }
      const { firstName, lastName } = splitName(r.name);
      const phone = cleanPhone(r.telefon);
      const emailLc = r.email.trim().toLowerCase();
      const emailHash = blindIndex(emailLc);
      const dup = await prisma.participant.findFirst({
        where: { eventId: event.id, emailHash },
      });
      if (dup) {
        summary.skipped++;
        summary.results.push({ row: rowNum, ok: true, message: "Bereits vorhanden", participantId: dup.id });
        continue;
      }
      const data: Prisma.ParticipantUncheckedCreateInput = {
        eventId: event.id,
        firstName: encryptField(firstName) ?? "",
        lastName: encryptField(lastName) ?? "",
        email: encryptField(emailLc) ?? "",
        emailHash,
        phone: encryptField(phone || null),
        company: encryptField(r.firma || null),
        street: encryptField(r.straße || null),
        zip: encryptField(r.plz || null),
        city: encryptField(r.ort || null),
        billingEmail: encryptField(r.emailRechnung || null),
        costCenter: encryptField(r.kostenstelle || null),
      };
      const p = await prisma.participant.create({ data });
      summary.created++;
      summary.results.push({ row: rowNum, ok: true, message: "Angelegt", participantId: p.id });
    } catch (e: any) {
      summary.failed++;
      summary.results.push({ row: rowNum, ok: false, message: `Fehler: ${e?.message ?? e}` });
    }
  }
  return summary;
}

// Format-Erkennung anhand der Header
export function detectFormat(csv: string): "anmeldungen" | "kontakte" | "unknown" {
  const rows = parseCsv(csv);
  if (rows.length === 0) return "unknown";
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  if (headers.includes("training-date")) return "anmeldungen";
  if (headers.includes("nachname-vorname") && headers.includes("email")) return "kontakte";
  return "unknown";
}

// Wird vom Type-Checker für Unused-Vermeidung benötigt
export type _Unused = EventFormat;
