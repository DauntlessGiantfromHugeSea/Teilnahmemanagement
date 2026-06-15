// Rendert Zertifikat / Teilnahmebescheinigung als PDF.
//
// Hintergrund ist das offizielle FBA-Briefpapier in
// public/cert-templates/fba-blank.pdf - Logo, Markenstreifen und
// Adressblock kommen aus diesem PDF. Der Text wird drueber gelegt.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DEFAULT_CERT_TEXTS, type CertificateData, type CertificateType, type CertTexts } from "./certificateContent";
import { getCertTexts } from "./kompetenzfelder";

const PAGE_W = 595;
const PAGE_H = 842;

const TEXT_LEFT = 70;
const TEXT_RIGHT = 525;          // Platz fuer Markenstreifen rechts
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;

const BRAND = rgb(0.06, 0.46, 0.43);     // teal #0f766e (FBA-Brand) - fuer Akzente
const COLOR_TEXT = rgb(0.10, 0.12, 0.14);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);

let cachedBlank: ArrayBuffer | null = null;
async function loadBlank(): Promise<ArrayBuffer> {
  if (cachedBlank) return cachedBlank;
  const p = path.join(process.cwd(), "public", "cert-templates", "fba-blank.pdf");
  const buf = await readFile(p);
  cachedBlank = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return cachedBlank;
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
  /** Wenn true: nur die Text-Inhalte ohne FBA-Briefpapier-Hintergrund.
   *  Fuer Druck auf bereits vorgedrucktes Briefpapier. */
  noBackground?: boolean;
}): Promise<Uint8Array> {
  let doc: PDFDocument;
  let page: PDFPage;
  if (args.noBackground) {
    doc = await PDFDocument.create();
    page = doc.addPage([PAGE_W, PAGE_H]);
  } else {
    // Briefpapier-PDF als Basis laden, dann auf der vorhandenen Seite ueberlagern
    const blank = await loadBlank();
    doc = await PDFDocument.load(blank);
    page = doc.getPage(0);
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  // Der Titel ("Zertifikat / Flüssigboden") sitzt entweder auf der Vorlage
  // ODER auf dem Vor-Druck-Briefpapier - in keiner Variante drucken wir ihn
  // also nochmal. Beide Varianten starten an derselben Y-Position, damit der
  // Inhalt auf dem Vor-Druck-Briefpapier genauso ausgerichtet ist wie bei der
  // Variante mit eingebettetem Hintergrund.
  const startY = PAGE_H - 250;
  const ctx: DrawCtx = { page, font, bold, italic, y: startY };

  if (args.type === "ZERTIFIKAT") {
    await renderZertifikat(ctx, args.data, args.number, doc, !!args.noBackground);
  } else {
    renderTeilnahme(ctx, args.data, args.number);
  }

  // Validierungs-Fuesschen wird IMMER gezeichnet (auch bei Briefpapier-Druck)
  drawIdFooter(page, font, args.number, args.validateUrl);
  return doc.save();
}

async function renderZertifikat(
  ctx: DrawCtx,
  d: CertificateData,
  number: string,
  doc: PDFDocument,
  noBackground: boolean,
) {
  const t: CertTexts = { ...DEFAULT_CERT_TEXTS, ...(d.texts ?? {}) };

  // Optional Norm-Linie (wenn Kompetenzfeld in normLineForIds)
  if (d.kompetenzfeld && t.normLineForIds.includes(d.kompetenzfeld.id)) {
    drawText(ctx, t.normLine, { size: 9, align: "center", color: COLOR_MUTED, leading: 12, spaceAfter: 10 });
  }

  // Kompetenzfeld-Label (kleiner, damit auch lange Bezeichnungen einzeilig passen)
  if (d.kompetenzfeld) {
    drawText(ctx, d.kompetenzfeld.label, { font: "bold", size: 10, align: "center", color: BRAND, leading: 13, spaceAfter: 6 });
  }

  // Nummer
  drawText(ctx, `Nr. ${number}`, { size: 10, align: "center", color: COLOR_MUTED, spaceAfter: 22 });

  // Anrede-Feld
  drawLabeledField(ctx, t.herrnFrauLabel, `${d.firstName} ${d.lastName}`);
  ctx.y -= 10;

  // Bestaetigungstext (ohne Namen davor, beginnt mit "wird bestätigt, ...")
  if (d.kompetenzfeld) {
    drawText(ctx, d.kompetenzfeld.text, { size: 11, leading: 16, spaceAfter: 18 });
  }

  // Bewertung
  drawText(ctx, t.bewertungLine, { size: 10, leading: 14, color: COLOR_TEXT, spaceAfter: 22 });

  // Gueltig bis (gleiche Groesse wie Fliesstext, nicht fett)
  if (d.validUntilShort) {
    drawText(ctx, tpl(t.validityLine, { validUntil: d.validUntilShort }), {
      size: 11, leading: 16, spaceAfter: 18,
    });
  }

  // Leipzig, den ... - Name+Position folgen wie in einem Brief 3 Zeilen darunter.
  drawText(ctx, tpl(t.leipzigDateLabel, { issuedAt: d.issuedDateShort }), {
    size: 11, leading: 16, spaceAfter: 48,
  });

  // GF-Unterschrift nur bei "ohne Briefpapier" (bg=0) und nur fuer ZERTIFIKATE
  // klein direkt ueber dem Namen stempeln. Auf dem Briefpapier-Druck wird die
  // Unterschrift weiterhin manuell aufgebracht.
  // WICHTIG: live aus AppSetting lesen, nicht aus dem Snapshot - so wirkt eine
  // nachtraeglich hochgeladene Unterschrift sofort auch fuer alte Zertifikate.
  let gfSignatureUrl: string | undefined = t.gfSignatureUrl;
  if (noBackground) {
    try {
      const live = await getCertTexts();
      gfSignatureUrl = live.gfSignatureUrl || gfSignatureUrl;
    } catch { /* fallback bleibt der Snapshot-Wert */ }
  }
  if (noBackground && gfSignatureUrl) {
    try {
      const localPath = gfSignatureUrl.startsWith("/uploads/")
        ? path.join(process.cwd(), "public", gfSignatureUrl)
        : null;
      if (localPath) {
        const buf = await readFile(localPath);
        const bytes = new Uint8Array(buf);
        const isPng = localPath.toLowerCase().endsWith(".png");
        const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const sw = 106;                               // ~3.75 cm breit (33% groesser als zuvor)
        const sh = (img.height / img.width) * sw;
        // Viele Signatur-PNGs haben oben/unten viel Weissraum. Wir lassen
        // die Box bewusst die Namenszeile leicht ueberlappen und schieben
        // ctx.y nur um die HALBE Bildhoehe ab. So sitzt die sichtbare
        // Unterschrift visuell direkt ueber dem Namen, ohne grosse Luecke.
        ctx.page.drawImage(img, {
          x: TEXT_LEFT,
          y: ctx.y - sh / 2 + 4,
          width: sw, height: sh,
        });
        ctx.y -= sh / 2 + 4;
      }
    } catch { /* still draw name without sig */ }
  }

  drawText(ctx, t.geschaeftsfuehrer, { size: 11 });
  drawText(ctx, t.geschaeftsfuehrerRole, { size: 10 });
}

function renderTeilnahme(ctx: DrawCtx, d: CertificateData, number: string) {
  const t: CertTexts = { ...DEFAULT_CERT_TEXTS, ...(d.texts ?? {}) };

  drawText(ctx, `Nr. ${number}`, { size: 10, align: "center", color: COLOR_MUTED, spaceAfter: 26 });

  drawLabeledField(ctx, t.herrnFrauLabel, `${d.firstName} ${d.lastName}`);
  ctx.y -= 10;

  // Body-Text aus dem Event/Schulungs-Setup. Nur dieser wird ausgegeben -
  // keine automatisch generierte Bestaetigungs-Zeile mehr.
  if (d.bodyText) {
    const paras = d.bodyText.split(/\n\s*\n/);
    for (const p of paras) {
      drawText(ctx, p.replace(/\s*\n\s*/g, " ").trim(), { size: 11, leading: 16, spaceAfter: 10 });
    }
    ctx.y -= 4;
  }

  drawText(ctx, tpl(t.leipzigDateLabel, { issuedAt: d.issuedDateShort }), {
    size: 11, leading: 16, spaceAfter: 48,
  });
  drawText(ctx, t.geschaeftsfuehrer, { size: 11 });
  drawText(ctx, t.geschaeftsfuehrerRole, { size: 10 });
}
