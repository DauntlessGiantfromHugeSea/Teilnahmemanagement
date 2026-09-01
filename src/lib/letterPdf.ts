// Leerer Brief auf dem FBA-Briefpapier: Betreff + Anrede + Freitext + Gruss.
// Reines Druck-Hilfsmittel, kein Mailversand.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LETTERHEAD_HEIGHT, LETTERHEAD_WIDTH, embedLetterhead } from "./letterhead";

const PAGE_W = 595;
const PAGE_H = 842;
const TEXT_LEFT = 70;
const STRIPE_W = 14;
const TEXT_RIGHT = PAGE_W - 60 - STRIPE_W;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const COLOR_TEXT = rgb(0.10, 0.12, 0.14);

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) { out.push(""); continue; }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(probe, size) <= maxW) line = probe;
      else { if (line) out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

interface Ctx { page: PDFPage; font: PDFFont; bold: PDFFont; y: number }

function drawBlock(ctx: Ctx, text: string, opts: {
  size?: number; bold?: boolean; leading?: number; spaceAfter?: number;
} = {}) {
  const size = opts.size ?? 11;
  const font = opts.bold ? ctx.bold : ctx.font;
  const leading = opts.leading ?? size * 1.5;
  for (const line of wrap(text, font, size, TEXT_WIDTH)) {
    if (line) ctx.page.drawText(line, { x: TEXT_LEFT, y: ctx.y, size, font, color: COLOR_TEXT });
    ctx.y -= leading;
  }
  if (opts.spaceAfter) ctx.y -= opts.spaceAfter;
}

export interface LetterArgs {
  recipient?: string | null;   // mehrzeilig: Name / Firma / Strasse / PLZ Ort
  date?: string | null;        // formatiertes Datum oder leer
  subject?: string | null;
  salutation?: string | null;  // z.B. "Sehr geehrte Damen und Herren,"
  body: string;                // Freitext, Zeilenumbrueche bleiben erhalten
  closing?: string | null;     // z.B. "Mit freundlichen Grüßen"
  signerName?: string | null;
  signerRole?: string | null;
}

export async function renderLetterPdf(args: LetterArgs): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const blank = await embedLetterhead(doc, "briefpapier-blank");
  const page = blank
    ? doc.addPage([LETTERHEAD_WIDTH, LETTERHEAD_HEIGHT])
    : doc.addPage([PAGE_W, PAGE_H]);
  if (blank) {
    page.drawPage(blank, { x: 0, y: 0, width: LETTERHEAD_WIDTH, height: LETTERHEAD_HEIGHT });
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { page, font, bold, y: PAGE_H - 220 };

  if (args.recipient && args.recipient.trim()) {
    drawBlock(ctx, args.recipient.trim(), { size: 11, spaceAfter: 18 });
  }

  if (args.date && args.date.trim()) {
    // rechtsbuendig auf Hoehe des Empfaengerblocks zurueckspringen waere
    // aufwendig; wir setzen das Datum schlicht in den Fliesstext.
    const dateLine = args.date.trim();
    const w = font.widthOfTextAtSize(dateLine, 11);
    page.drawText(dateLine, { x: TEXT_RIGHT - w, y: ctx.y + 4, size: 11, font, color: COLOR_TEXT });
    ctx.y -= 18;
  }

  if (args.subject && args.subject.trim()) {
    drawBlock(ctx, args.subject.trim(), { bold: true, size: 12, spaceAfter: 14 });
  }

  if (args.salutation && args.salutation.trim()) {
    drawBlock(ctx, args.salutation.trim(), { size: 11, spaceAfter: 8 });
  }

  drawBlock(ctx, args.body, { size: 11, spaceAfter: 22 });

  if (args.closing && args.closing.trim()) {
    drawBlock(ctx, args.closing.trim(), { size: 11, spaceAfter: 48 });
  }
  if (args.signerName && args.signerName.trim()) {
    drawBlock(ctx, args.signerName.trim(), { size: 11, bold: true });
  }
  if (args.signerRole && args.signerRole.trim()) {
    drawBlock(ctx, args.signerRole.trim(), { size: 10 });
  }

  return await doc.save();
}
