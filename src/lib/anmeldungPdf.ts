// Anmeldebestaetigung als PDF auf dem FBA-Briefpapier.
//
// Variante:
//   - Default: 'Diese Bestaetigung ist ohne Unterschrift gueltig, weil digital ausgestellt.'
//   - ?signature=1: rendert eine leere Unterschriftslinie zum manuellen Unterschreiben.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_W = 595;
const PAGE_H = 842;
const TEXT_LEFT = 70;
const TEXT_RIGHT = 525;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const COLOR_TEXT = rgb(0.10, 0.12, 0.14);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);
const BRAND = rgb(0.06, 0.46, 0.43);

let cachedBlank: ArrayBuffer | null = null;
async function loadBlank(): Promise<ArrayBuffer> {
  if (cachedBlank) return cachedBlank;
  const p = path.join(process.cwd(), "public", "cert-templates", "fba-blank.pdf");
  const buf = await readFile(p);
  cachedBlank = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return cachedBlank;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) <= maxW) line = probe;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

interface Ctx { page: PDFPage; font: PDFFont; bold: PDFFont; y: number }

function drawText(ctx: Ctx, text: string, opts: {
  size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "center";
  leading?: number; spaceAfter?: number; maxWidth?: number;
} = {}) {
  const size = opts.size ?? 11;
  const font = opts.bold ? ctx.bold : ctx.font;
  const color = opts.color ?? COLOR_TEXT;
  const leading = opts.leading ?? size * 1.4;
  const maxWidth = opts.maxWidth ?? TEXT_WIDTH;
  for (const line of wrap(text, font, size, maxWidth)) {
    let x = TEXT_LEFT;
    if (opts.align === "center") {
      x = TEXT_LEFT + (maxWidth - font.widthOfTextAtSize(line, size)) / 2;
    }
    ctx.page.drawText(line, { x, y: ctx.y, size, font, color });
    ctx.y -= leading;
  }
  if (opts.spaceAfter) ctx.y -= opts.spaceAfter;
}

export interface AnmeldebestaetigungArgs {
  firstName: string;
  lastName: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  eventTitle: string;
  trainingTitle?: string | null;
  day1Date: Date | null;
  day2Date: Date | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  format?: "PRESENCE" | "WEBINAR";
  meetingUrl?: string | null;
  dayLabel: string;
  priceLine?: string;
  status?: string;
  invoiceStatus?: string;
  invoiceNumber?: string | null;
  bookedAt: Date;
  /** Name der Person, die diese Bestaetigung ausstellt (eingeloggter User) */
  issuedBy: string;
  /** true: ohne Hintergrund (fuer Druck auf Briefpapier) */
  noBackground?: boolean;
  /** true: leere Unterschriftslinie statt 'ohne Unterschrift gueltig' */
  withSignatureLine?: boolean;
}

function fmtDateLong(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Angemeldet",
  CONFIRMED: "Bestätigt",
  ATTENDED: "Teilgenommen",
  NO_SHOW: "Nicht erschienen",
  CANCELLED: "Storniert",
};
const INVOICE_LABEL: Record<string, string> = {
  OPEN: "offen",
  ISSUED: "Rechnung gestellt",
  PAID: "bezahlt",
  CANCELLED: "storniert",
};

export async function renderAnmeldebestaetigungPdf(args: AnmeldebestaetigungArgs): Promise<Uint8Array> {
  let doc: PDFDocument;
  let page: PDFPage;
  if (args.noBackground) {
    doc = await PDFDocument.create();
    page = doc.addPage([PAGE_W, PAGE_H]);
  } else {
    const blank = await loadBlank();
    doc = await PDFDocument.load(blank);
    page = doc.getPage(0);
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { page, font, bold, y: PAGE_H - 250 };

  drawText(ctx, "Anmeldebestätigung", { bold: true, size: 18, align: "center", spaceAfter: 18 });

  drawText(ctx, "Hiermit bestätigen wir die Anmeldung von", { size: 11, align: "center", spaceAfter: 6 });
  drawText(ctx, `${args.firstName} ${args.lastName}`, {
    bold: true, size: 16, align: "center", spaceAfter: args.company ? 4 : 16,
  });
  if (args.company) {
    drawText(ctx, args.company, { size: 11, align: "center", color: COLOR_MUTED, spaceAfter: 16 });
  }

  drawText(ctx, "zur folgenden Veranstaltung:", { size: 11, spaceAfter: 8 });

  const d1 = fmtDateLong(args.day1Date);
  const d2 = fmtDateLong(args.day2Date);
  const dateLine = d1 && d2 ? `${d1} – ${d2}` : (d1 || "Termin folgt");
  const timeLine = args.startTime && args.endTime ? `${args.startTime} – ${args.endTime} Uhr` : "";

  const rows: [string, string][] = [
    ["Veranstaltung:", args.eventTitle],
    ...(args.trainingTitle && args.trainingTitle !== args.eventTitle
      ? [["Schulung:", args.trainingTitle] as [string, string]] : []),
    ["Termin:", dateLine + (timeLine ? `, ${timeLine}` : "")],
    ["Tagewahl:", args.dayLabel],
    ...(args.format === "WEBINAR"
      ? [["Format:", "Webinar"] as [string, string],
         ...(args.meetingUrl ? [["Zugang:", args.meetingUrl] as [string, string]] : [])]
      : args.location
      ? [["Ort:", args.location] as [string, string]]
      : []),
    ...(args.priceLine ? [["Preis:", args.priceLine] as [string, string]] : []),
    ...(args.status ? [["Status:", STATUS_LABEL[args.status] ?? args.status] as [string, string]] : []),
    ...(args.invoiceStatus
      ? [["Rechnung:", `${INVOICE_LABEL[args.invoiceStatus] ?? args.invoiceStatus}${args.invoiceNumber ? ` (Nr. ${args.invoiceNumber})` : ""}`] as [string, string]]
      : []),
    ["Anmeldedatum:", args.bookedAt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })],
    ...(args.email ? [["E-Mail:", args.email] as [string, string]] : []),
    ...(args.phone ? [["Telefon:", args.phone] as [string, string]] : []),
  ];
  const labelX = TEXT_LEFT;
  const valueX = TEXT_LEFT + 110;
  const valueW = TEXT_RIGHT - valueX;
  for (const [label, value] of rows) {
    const lines = wrap(value, font, 10.5, valueW);
    page.drawText(label, { x: labelX, y: ctx.y, size: 10, font, color: COLOR_MUTED });
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], { x: valueX, y: ctx.y - i * 14, size: 10.5, font: bold, color: COLOR_TEXT });
    }
    ctx.y -= Math.max(15, lines.length * 14 + 2);
  }
  ctx.y -= 12;

  drawText(ctx,
    "Diese Bestätigung dient als Nachweis Ihrer Anmeldung. Die Rechnung wird " +
    "(sofern nicht bereits geschehen) separat zugestellt. Bei Fragen erreichen " +
    "Sie uns unter info@fb-akademie.de.",
    { size: 10, leading: 14, color: COLOR_TEXT, spaceAfter: 22 }
  );

  drawText(ctx, `Leipzig, ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}`, {
    size: 11, spaceAfter: 36,
  });

  if (args.withSignatureLine) {
    page.drawLine({
      start: { x: TEXT_LEFT, y: ctx.y + 4 },
      end: { x: TEXT_LEFT + 220, y: ctx.y + 4 },
      thickness: 0.5, color: COLOR_MUTED,
    });
    drawText(ctx, args.issuedBy, { size: 10, bold: true });
    drawText(ctx, "Flüssigboden Akademie", { size: 9, color: COLOR_MUTED });
  } else {
    drawText(ctx, args.issuedBy, { size: 10, bold: true });
    drawText(ctx, "Flüssigboden Akademie", { size: 9, color: COLOR_MUTED, spaceAfter: 12 });
    drawText(ctx,
      "Diese Bestätigung ist ohne Unterschrift gültig, weil sie digital ausgestellt wurde.",
      { size: 9, color: BRAND, leading: 12 }
    );
  }

  return doc.save();
}
