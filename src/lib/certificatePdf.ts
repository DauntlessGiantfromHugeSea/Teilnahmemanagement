// Rendert Zertifikat / Teilnahmebescheinigung als PDF.
// Layout-Strategie: Hintergrund-PDF (public/cert-templates/fba-blank.pdf) als
// Basis, dann Text-Overlay mit pdf-lib.
//
// Koordinaten in PDF-Punkten, Ursprung unten links (Standard pdf-lib).
// Seite A4 Hochformat: 595 x 842 pt.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CertificateData, CertificateType } from "./certificateContent";

const PAGE_W = 595;
const PAGE_H = 842;

// Bereich, in dem der Fliesstext steht (Logo oben, Footer unten, Brandleiste rechts ausgespart)
const TEXT_LEFT = 60;
const TEXT_RIGHT = 525; // ~ 595 - 60 - 10 (Brandleiste rechts)
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;

const COLOR_TEXT = rgb(0.12, 0.12, 0.14);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);
const COLOR_BRAND = rgb(0.06, 0.46, 0.43); // ~ #0f766e

let cachedBlank: ArrayBuffer | null = null;
async function loadBlank(): Promise<ArrayBuffer> {
  if (cachedBlank) return cachedBlank;
  const p = path.join(process.cwd(), "public", "cert-templates", "fba-blank.pdf");
  const buf = await readFile(p);
  cachedBlank = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return cachedBlank;
}

// Zeilenumbruch nach Wortgrenze.
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
  y: number;
}

function drawParagraph(ctx: DrawCtx, text: string, opts?: {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "center";
  leading?: number;
  spaceAfter?: number;
  maxWidth?: number;
}): void {
  const size = opts?.size ?? 11;
  const font = opts?.bold ? ctx.bold : ctx.font;
  const color = opts?.color ?? COLOR_TEXT;
  const leading = opts?.leading ?? size * 1.35;
  const maxWidth = opts?.maxWidth ?? TEXT_WIDTH;
  const lines = wrap(text, font, size, maxWidth);
  for (const line of lines) {
    let x = TEXT_LEFT;
    if (opts?.align === "center") {
      const w = font.widthOfTextAtSize(line, size);
      x = TEXT_LEFT + (maxWidth - w) / 2;
    }
    ctx.page.drawText(line, { x, y: ctx.y, size, font, color });
    ctx.y -= leading;
  }
  if (opts?.spaceAfter) ctx.y -= opts.spaceAfter;
}

function drawIdFooter(page: PDFPage, font: PDFFont, certNumber: string, validateUrl: string) {
  // Ueber dem vorhandenen Adress-Footer der Hintergrund-PDF platzieren
  // (Adresse beginnt bei ca. y=80). Wir bleiben oberhalb mit Sicherheitsabstand.
  page.drawText(`Nr. ${certNumber}`, {
    x: TEXT_LEFT,
    y: 130,
    size: 7,
    font,
    color: COLOR_MUTED,
  });
  page.drawText(`Validierung: ${validateUrl}`, {
    x: TEXT_LEFT,
    y: 120,
    size: 7,
    font,
    color: COLOR_MUTED,
  });
}

export async function renderCertificatePdf(args: {
  type: CertificateType;
  number: string;
  data: CertificateData;
  validateUrl: string;
}): Promise<Uint8Array> {
  const blank = await loadBlank();
  const doc = await PDFDocument.load(blank);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.getPage(0);
  // Startpunkt unter dem Titel "Zertifikat / Flüssigboden" (ca. y=620 von unten gesehen)
  const ctx: DrawCtx = { page, font, bold, y: 560 };

  if (args.type === "ZERTIFIKAT") {
    renderZertifikat(ctx, args.data, args.number);
  } else {
    renderTeilnahme(ctx, args.data, args.number);
  }

  drawIdFooter(page, font, args.number, args.validateUrl);

  return doc.save();
}

function renderZertifikat(ctx: DrawCtx, d: CertificateData, number: string) {
  // Untertitel + Nummer
  drawParagraph(ctx, `über ${d.trainingTitle}`, { align: "center", size: 13, bold: true, spaceAfter: 4 });
  drawParagraph(ctx, `Nr. ${number}`, { align: "center", size: 10, color: COLOR_MUTED, spaceAfter: 16 });

  // Anrede
  drawParagraph(ctx, "Hiermit wird bescheinigt, dass", { align: "center", size: 11, spaceAfter: 6 });
  drawParagraph(ctx, `${d.firstName} ${d.lastName}`, { align: "center", size: 18, bold: true, spaceAfter: 14 });

  drawParagraph(
    ctx,
    `am ${d.eventDateLine} erfolgreich an der Schulung „${d.eventTitle}“ teilgenommen hat${d.ueLine ? ` und mit ${d.ueLine} anerkannt wurde` : ""}.`,
    { size: 11, spaceAfter: 12 }
  );

  if (d.kompetenzfelder && d.kompetenzfelder.length > 0) {
    drawParagraph(ctx, "Im Rahmen der Schulung wurden folgende Kompetenzfelder bestätigt:", {
      size: 11, bold: true, spaceAfter: 8,
    });
    for (const k of d.kompetenzfelder) {
      drawParagraph(ctx, k.label, { size: 10, bold: true, color: COLOR_BRAND, spaceAfter: 2 });
      drawParagraph(ctx, `${d.firstName} ${d.lastName} ${k.text}`, {
        size: 9.5, color: COLOR_TEXT, leading: 12, spaceAfter: 6,
      });
    }
  }

  // Footer-Block (Norm + Bewertung)
  ctx.y = Math.max(ctx.y, 200);
  drawParagraph(ctx, "Nach den Anforderungen der Werksnorm WN 23.0.2 und der RegNorm – Guide für Verfüllbaustoffe – nationales Register zur Veröffentlichung von Normen VSS 2023-08.", {
    size: 8, color: COLOR_MUTED, leading: 11, spaceAfter: 6,
  });
  drawParagraph(ctx, "Die Bewertung erfolgte durch die Flüssigboden Akademie UG in Zusammenarbeit mit der Forschungsinstitut für Flüssigboden GmbH in ihrer Eigenschaft als Verfahrensentwicklerin, Rezepturentwicklerin und Fachplanerin.", {
    size: 8, color: COLOR_MUTED, leading: 11, spaceAfter: 12,
  });

  drawSignature(ctx, d);
}

function renderTeilnahme(ctx: DrawCtx, d: CertificateData, number: string) {
  drawParagraph(ctx, "über die Teilnahme.", { align: "center", size: 13, bold: true, spaceAfter: 4 });
  drawParagraph(ctx, `Nr. ${number}`, { align: "center", size: 10, color: COLOR_MUTED, spaceAfter: 16 });

  drawParagraph(ctx, "Hiermit wird bescheinigt, dass", { align: "center", size: 11, spaceAfter: 6 });
  drawParagraph(ctx, `${d.firstName} ${d.lastName}`, { align: "center", size: 18, bold: true, spaceAfter: 14 });

  drawParagraph(
    ctx,
    `am ${d.eventDateLine} erfolgreich an der Schulung „${d.eventTitle}“ teilgenommen hat${d.ueLine ? `. Die Schulung wurde mit ${d.ueLine} anerkannt` : ""}.`,
    { size: 11, spaceAfter: 12 }
  );

  if (d.bodyText) {
    const paras = d.bodyText.split(/\n\s*\n/);
    for (const p of paras) {
      drawParagraph(ctx, p.replace(/\s*\n\s*/g, " ").trim(), { size: 10, leading: 14, spaceAfter: 8 });
    }
    ctx.y -= 4;
  }

  drawSignature(ctx, d);
}

function drawSignature(ctx: DrawCtx, d: CertificateData) {
  // Reserviere Platz fuer Unterschriften-Block unten
  ctx.y = Math.max(ctx.y, 170);
  drawParagraph(ctx, d.issuedDateLine, { size: 10, spaceAfter: 26 });
  // Unterschrift-Linie (gedacht zum Drauf-Unterschreiben)
  ctx.page.drawLine({
    start: { x: TEXT_LEFT, y: ctx.y + 4 },
    end: { x: TEXT_LEFT + 200, y: ctx.y + 4 },
    thickness: 0.4,
    color: COLOR_MUTED,
  });
  drawParagraph(ctx, d.geschaeftsfuehrer, { size: 10, bold: true, spaceAfter: 0 });
  drawParagraph(ctx, "Geschäftsführer", { size: 9, color: COLOR_MUTED });
}
