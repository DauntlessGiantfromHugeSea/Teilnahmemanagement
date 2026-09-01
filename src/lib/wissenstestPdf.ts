// Druckbarer Wissenstest fuer den Offline-/Papier-Modus.
// Layout: Briefpapier-Hintergrund, oben Schulungstitel + ID + Teilnehmername,
// dann nummerierte Fragen mit Auswahlkaestchen, ganz unten ein eindeutiger
// Code, ueber den die Auswertung spaeter zugeordnet wird.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LETTERHEAD_HEIGHT, LETTERHEAD_WIDTH, embedLetterhead } from "./letterhead";

const PAGE_W = 595;
const PAGE_H = 842;
const TEXT_LEFT = 70;
const STRIPE_W = 14;
const TEXT_RIGHT = PAGE_W - 60 - STRIPE_W;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const COLOR_TEXT = rgb(0.10, 0.12, 0.14);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);
const BRAND = rgb(0.06, 0.46, 0.43);

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

interface PageCtx { doc: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont; y: number; pageNum: number; total: number }

async function newPage(ctx: PageCtx): Promise<void> {
  // Das Briefpapier wird pro Dokument nur einmal eingebettet und auf jeder
  // Seite gezeichnet - frueher bekam jede Seite ihre eigene Kopie.
  const blank = await embedLetterhead(ctx.doc, "briefpapier-blank");
  let newPg: PDFPage;
  if (blank) {
    newPg = ctx.doc.addPage([LETTERHEAD_WIDTH, LETTERHEAD_HEIGHT]);
    newPg.drawPage(blank, { x: 0, y: 0, width: LETTERHEAD_WIDTH, height: LETTERHEAD_HEIGHT });
  } else {
    newPg = ctx.doc.addPage([PAGE_W, PAGE_H]);
  }
  ctx.page = newPg;
  ctx.y = PAGE_H - 220;
  ctx.pageNum += 1;
}

function ensureSpace(ctx: PageCtx, need: number, addPage: () => Promise<void>) {
  if (ctx.y - need < 120) return addPage();
  return Promise.resolve();
}

function drawText(ctx: PageCtx, text: string, opts: {
  size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; leading?: number; indent?: number; spaceAfter?: number;
} = {}) {
  const size = opts.size ?? 11;
  const font = opts.bold ? ctx.bold : ctx.font;
  const color = opts.color ?? COLOR_TEXT;
  const leading = opts.leading ?? size * 1.45;
  const x0 = TEXT_LEFT + (opts.indent ?? 0);
  const width = TEXT_WIDTH - (opts.indent ?? 0);
  for (const line of wrap(text, font, size, width)) {
    if (line) ctx.page.drawText(line, { x: x0, y: ctx.y, size, font, color });
    ctx.y -= leading;
  }
  if (opts.spaceAfter) ctx.y -= opts.spaceAfter;
}

export interface WissenstestQuestion {
  text: string;
  options: string[];
}

export interface WissenstestPdfArgs {
  eventTitle: string;
  externalId?: string | null;
  eventDate?: string | null;
  participantName: string;
  participantCompany?: string | null;
  questions: WissenstestQuestion[];
  code: string;
}

export async function renderWissenstestPdf(args: WissenstestPdfArgs): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: PageCtx = { doc, page: undefined as any, font, bold, y: 0, pageNum: 0, total: 0 };
  await newPage(ctx);

  // Kopf
  drawText(ctx, "Wissenstest", { bold: true, size: 22, color: BRAND, spaceAfter: 6 });
  drawText(ctx, args.eventTitle, { size: 14, bold: true, spaceAfter: 4 });
  if (args.eventDate) drawText(ctx, args.eventDate, { size: 10, color: COLOR_MUTED });
  if (args.externalId) drawText(ctx, `Schulungs-ID: ${args.externalId}`, { size: 10, color: COLOR_MUTED });
  ctx.y -= 6;

  // Teilnehmer-Block
  drawText(ctx, "Teilnehmer/in", { size: 9, color: COLOR_MUTED, leading: 11 });
  drawText(ctx, args.participantName, { size: 13, bold: true, spaceAfter: args.participantCompany ? 2 : 14 });
  if (args.participantCompany) {
    drawText(ctx, args.participantCompany, { size: 10, color: COLOR_MUTED, spaceAfter: 14 });
  }

  // Hinweis-Box
  drawText(ctx,
    "Bitte kreuzen Sie pro Frage genau eine Antwort an. Geben Sie den Bogen am Ende der Schulung ab.",
    { size: 10, color: COLOR_MUTED, spaceAfter: 18 }
  );

  // Fragen
  for (let i = 0; i < args.questions.length; i++) {
    const q = args.questions[i];
    const lines = wrap(`${i + 1}. ${q.text}`, bold, 12, TEXT_WIDTH);
    const need = lines.length * 17 + (q.options.length * 18) + 18;
    await ensureSpace(ctx, need, () => newPage(ctx));

    drawText(ctx, `${i + 1}. ${q.text}`, { size: 12, bold: true, leading: 17, spaceAfter: 6 });
    for (const opt of q.options) {
      await ensureSpace(ctx, 22, () => newPage(ctx));
      // Checkbox-Kaestchen
      const boxY = ctx.y - 1;
      ctx.page.drawRectangle({
        x: TEXT_LEFT + 6, y: boxY - 8, width: 11, height: 11,
        borderColor: COLOR_TEXT, borderWidth: 0.8,
      });
      ctx.page.drawText(opt, { x: TEXT_LEFT + 24, y: ctx.y - 7, size: 11, font, color: COLOR_TEXT });
      ctx.y -= 18;
    }
    ctx.y -= 10;
  }

  // Code-Block am Ende
  await ensureSpace(ctx, 80, () => newPage(ctx));
  ctx.y -= 10;
  ctx.page.drawLine({
    start: { x: TEXT_LEFT, y: ctx.y },
    end: { x: TEXT_RIGHT, y: ctx.y },
    color: COLOR_MUTED, thickness: 0.5,
  });
  ctx.y -= 18;
  drawText(ctx, "Auswertung (vom Trainer auszufuellen)", { size: 9, color: COLOR_MUTED, leading: 11 });
  ctx.y -= 4;
  // Code groß
  const codeStr = args.code;
  ctx.page.drawText(codeStr, {
    x: TEXT_LEFT, y: ctx.y - 18, size: 22, font: bold, color: BRAND,
  });
  // Hinweis rechts
  ctx.page.drawText("Code im Auswertungsformular eingeben", {
    x: TEXT_LEFT + 200, y: ctx.y - 12, size: 9, font, color: COLOR_MUTED,
  });
  ctx.y -= 36;
  drawText(ctx, `Richtige Antworten: _____ / ${args.questions.length}`,
    { size: 11, color: COLOR_TEXT });

  return await doc.save();
}

// Mehrere PDFs zu einer Datei zusammenfuegen (Bulk-Druck).
export async function mergeWissenstestPdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return await out.save();
}
