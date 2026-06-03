// Rendert Zertifikat / Teilnahmebescheinigung als PDF.
//
// Die PDF wird komplett von Grund auf gezeichnet (pdf-lib), damit das Layout
// pixelgenau der bestehenden Word-Vorlage entspricht. Hintergrund, Logo,
// Footer-Adressblock und der rechte Markenstreifen werden hier erzeugt.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { DEFAULT_CERT_TEXTS, type CertificateData, type CertificateType, type CertTexts } from "./certificateContent";

const PAGE_W = 595;
const PAGE_H = 842;

const TEXT_LEFT = 70;
const TEXT_RIGHT = 525;          // Platz fuer Markenstreifen rechts
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;

const BRAND = rgb(0.06, 0.46, 0.43); // teal #0f766e (FBA-Brand)
const COLOR_TEXT = rgb(0.10, 0.12, 0.14);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);

let cachedLogo: ArrayBuffer | null = null;
async function loadLogo(): Promise<ArrayBuffer> {
  if (cachedLogo) return cachedLogo;
  const p = path.join(process.cwd(), "public", "logo-fba.png");
  const buf = await readFile(p);
  cachedLogo = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return cachedLogo;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
      line = probe;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  y: number;
}

interface DrawOpts {
  size?: number;
  font?: "regular" | "bold" | "italic";
  color?: ReturnType<typeof rgb>;
  align?: "left" | "center" | "right";
  leading?: number;
  spaceAfter?: number;
  maxWidth?: number;
  x?: number;
}

function pickFont(ctx: DrawCtx, f: DrawOpts["font"]): PDFFont {
  if (f === "bold") return ctx.bold;
  if (f === "italic") return ctx.italic;
  return ctx.font;
}

function drawText(ctx: DrawCtx, text: string, opts: DrawOpts = {}): void {
  const size = opts.size ?? 11;
  const font = pickFont(ctx, opts.font);
  const color = opts.color ?? COLOR_TEXT;
  const leading = opts.leading ?? size * 1.4;
  const maxWidth = opts.maxWidth ?? TEXT_WIDTH;
  const left = opts.x ?? TEXT_LEFT;
  const lines = wrap(text, font, size, maxWidth);
  for (const line of lines) {
    let x = left;
    if (opts.align === "center") {
      const w = font.widthOfTextAtSize(line, size);
      x = left + (maxWidth - w) / 2;
    } else if (opts.align === "right") {
      const w = font.widthOfTextAtSize(line, size);
      x = left + maxWidth - w;
    }
    ctx.page.drawText(line, { x, y: ctx.y, size, font, color });
    ctx.y -= leading;
  }
  if (opts.spaceAfter) ctx.y -= opts.spaceAfter;
}

function drawBrandFrame(page: PDFPage, font: PDFFont, bold: PDFFont) {
  // Brandstreifen rechts
  page.drawRectangle({
    x: PAGE_W - 14, y: 0, width: 14, height: PAGE_H,
    color: BRAND,
  });
  // Rotierter Brand-Text auf dem Streifen
  page.drawText("Zertifikat Flüssigboden", {
    x: PAGE_W - 8, y: 70,
    size: 9, font, color: rgb(1, 1, 1), rotate: degrees(90),
  });

  // Footer-Adressblock (links)
  page.drawText("Flüssigboden Akademie UG", { x: TEXT_LEFT, y: 70, size: 8, font: bold, color: COLOR_TEXT });
  page.drawText("Merseburger Str. 189", { x: TEXT_LEFT, y: 58, size: 8, font, color: COLOR_MUTED });
  page.drawText("04179 Leipzig", { x: TEXT_LEFT, y: 46, size: 8, font, color: COLOR_MUTED });
  page.drawText("info@fb-akademie.de", { x: TEXT_LEFT, y: 34, size: 8, font, color: COLOR_MUTED });

  // Footer-Adressblock (Mitte)
  const midX = 260;
  page.drawText("Geschäftsführer:", { x: midX, y: 58, size: 8, font, color: COLOR_MUTED });
  page.drawText("M.Sc. Wolf-Hagen Stolzenburg", { x: midX, y: 46, size: 8, font, color: COLOR_TEXT });
  page.drawText("www.fb-akademie.de", { x: midX, y: 34, size: 8, font, color: COLOR_MUTED });
}

function drawLogo(page: PDFPage, logo: PDFImage) {
  // Logo oben links, ca. 130pt breit
  const w = 130;
  const h = (logo.height / logo.width) * w;
  page.drawImage(logo, { x: TEXT_LEFT, y: PAGE_H - 30 - h, width: w, height: h });
}

function drawIdFooter(page: PDFPage, font: PDFFont, number: string, validateUrl: string) {
  // Validierung als kleine 2-Zeilen ueber dem Adress-Footer.
  page.drawText(`Nr. ${number}`, { x: TEXT_LEFT, y: 100, size: 7, font, color: COLOR_MUTED });
  page.drawText(`Validierung: ${validateUrl}`, { x: TEXT_LEFT, y: 90, size: 7, font, color: COLOR_MUTED });
}

function drawLabeledField(ctx: DrawCtx, label: string, value: string) {
  // Z.B. "Herrn/Frau     {Name}" — Label links, Wert mit Abstand.
  const labelFont = ctx.font;
  const valFont = ctx.bold;
  const ls = 11; const vs = 12;
  ctx.page.drawText(label, { x: TEXT_LEFT, y: ctx.y, size: ls, font: labelFont, color: COLOR_TEXT });
  ctx.page.drawText(value, { x: TEXT_LEFT + 120, y: ctx.y, size: vs, font: valFont, color: COLOR_TEXT });
  ctx.y -= 26;
}

function tpl(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export async function renderCertificatePdf(args: {
  type: CertificateType;
  number: string;
  data: CertificateData;
  validateUrl: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logoBytes = await loadLogo();
  const logo = await doc.embedPng(logoBytes);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  drawLogo(page, logo);
  drawBrandFrame(page, font, bold);

  const ctx: DrawCtx = { page, font, bold, italic, y: PAGE_H - 200 };

  if (args.type === "ZERTIFIKAT") renderZertifikat(ctx, args.data, args.number);
  else renderTeilnahme(ctx, args.data, args.number);

  drawIdFooter(page, font, args.number, args.validateUrl);
  return doc.save();
}

function renderZertifikat(ctx: DrawCtx, d: CertificateData, number: string) {
  const t: CertTexts = { ...DEFAULT_CERT_TEXTS, ...(d.texts ?? {}) };
  // Titel + Untertitel zentriert
  drawText(ctx, t.title, { font: "bold", size: 30, align: "center", leading: 34, spaceAfter: 0 });
  drawText(ctx, t.subtitle, { font: "bold", size: 16, align: "center", color: COLOR_TEXT, spaceAfter: 16 });

  // Optional Norm-Linie (wenn Kompetenzfeld in normLineForIds)
  if (d.kompetenzfeld && t.normLineForIds.includes(d.kompetenzfeld.id)) {
    drawText(ctx, t.normLine, { size: 9, align: "center", color: COLOR_MUTED, leading: 12, spaceAfter: 14 });
  }

  // Kompetenzfeld-Label
  if (d.kompetenzfeld) {
    drawText(ctx, d.kompetenzfeld.label, { font: "bold", size: 13, align: "center", color: BRAND, spaceAfter: 10 });
  }

  // Nummer
  drawText(ctx, `Nr. ${number}`, { size: 10, align: "center", color: COLOR_MUTED, spaceAfter: 30 });

  // Anrede-Feld
  drawLabeledField(ctx, t.herrnFrauLabel, `${d.firstName} ${d.lastName}`);
  ctx.y -= 10;

  // Bestaetigungstext (ohne Namen davor, beginnt mit "wird bestätigt, ...")
  if (d.kompetenzfeld) {
    drawText(ctx, d.kompetenzfeld.text, { size: 11, leading: 16, spaceAfter: 18 });
  }

  // Bewertung
  drawText(ctx, t.bewertungLine, { size: 10, leading: 14, color: COLOR_TEXT, spaceAfter: 22 });

  // Gueltig bis (nur wenn ein Datum gesetzt ist)
  if (d.validUntilShort) {
    drawText(ctx, tpl(t.validityLine, { validUntil: d.validUntilShort }), {
      size: 11, font: "bold", spaceAfter: 18,
    });
  }

  // Leipzig, den ...
  drawText(ctx, tpl(t.leipzigDateLabel, { issuedAt: d.issuedDateShort }), {
    size: 10, spaceAfter: 48,
  });

  // Unterschriftslinie
  ctx.page.drawLine({
    start: { x: TEXT_LEFT, y: ctx.y + 4 },
    end: { x: TEXT_LEFT + 220, y: ctx.y + 4 },
    thickness: 0.4, color: COLOR_MUTED,
  });
  drawText(ctx, t.geschaeftsfuehrer, { size: 10, font: "bold" });
  drawText(ctx, t.geschaeftsfuehrerRole, { size: 9, color: COLOR_MUTED });
}

function renderTeilnahme(ctx: DrawCtx, d: CertificateData, number: string) {
  const t: CertTexts = { ...DEFAULT_CERT_TEXTS, ...(d.texts ?? {}) };
  drawText(ctx, t.tnTitle, { font: "bold", size: 26, align: "center", spaceAfter: 4 });
  drawText(ctx, t.subtitle, { font: "bold", size: 14, align: "center", spaceAfter: 14 });

  drawText(ctx, `Nr. ${number}`, { size: 10, align: "center", color: COLOR_MUTED, spaceAfter: 26 });

  drawLabeledField(ctx, t.herrnFrauLabel, `${d.firstName} ${d.lastName}`);
  ctx.y -= 4;

  drawText(ctx,
    `hat am ${d.eventDateLine} erfolgreich an der Schulung „${d.eventTitle}“ teilgenommen.`,
    { size: 11, leading: 16, spaceAfter: 14 });

  if (d.bodyText) {
    const paras = d.bodyText.split(/\n\s*\n/);
    for (const p of paras) {
      drawText(ctx, p.replace(/\s*\n\s*/g, " ").trim(), { size: 10, leading: 14, spaceAfter: 8 });
    }
    ctx.y -= 6;
  }

  drawText(ctx, tpl(t.leipzigDateLabel, { issuedAt: d.issuedDateShort }), {
    size: 10, spaceAfter: 48,
  });

  ctx.page.drawLine({
    start: { x: TEXT_LEFT, y: ctx.y + 4 },
    end: { x: TEXT_LEFT + 220, y: ctx.y + 4 },
    thickness: 0.4, color: COLOR_MUTED,
  });
  drawText(ctx, t.geschaeftsfuehrer, { size: 10, font: "bold" });
  drawText(ctx, t.geschaeftsfuehrerRole, { size: 9, color: COLOR_MUTED });
}
