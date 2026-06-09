// A3-Plakat der Agenda im FBA-Design.
//
// Hintergrund ist das offizielle FBA-Briefpapier (public/cert-templates/
// briefpapier-blank.pdf, A4-Format). Wir embedden die A4-Seite als FormXObject
// und skalieren sie auf A3 hoch (A4 → A3 = sqrt(2)).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface AgendaPdfItem {
  startTime: string;
  endTime: string | null;
  durationMin: number;
  title: string;
  speaker: string | null;
  description: string | null;
  day: number;
}

export interface AgendaPdfOptions {
  eventTitle: string;
  day1Date: Date | null;
  day2Date: Date | null;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  items: AgendaPdfItem[];
  /** Wird ignoriert - Hintergrund kommt aus dem Briefpapier-PDF. */
  logoBuffer?: Buffer | null;
}

// A3 portrait
const PAGE_W = 842;
const PAGE_H = 1191;
const MARGIN_L = 90;
const MARGIN_R = 60;
const STRIPE_W = 26;     // Hintergrund-PDF hat eigenen Streifen; wir respektieren ihn beim Inhalt

const TEXT_LEFT = MARGIN_L;
const TEXT_RIGHT = PAGE_W - MARGIN_R - STRIPE_W;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;

const BRAND = rgb(0.06, 0.46, 0.43);
const BRAND_SOFT = rgb(0.92, 0.99, 0.96);
const COLOR_TEXT = rgb(0.06, 0.09, 0.16);
const COLOR_MUTED = rgb(0.28, 0.33, 0.40);
const COLOR_LIGHT = rgb(0.40, 0.45, 0.51);

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

let cachedBlank: ArrayBuffer | null = null;
async function loadBriefpapier(): Promise<ArrayBuffer | null> {
  if (cachedBlank) return cachedBlank;
  try {
    const p = path.join(process.cwd(), "public", "cert-templates", "briefpapier-blank.pdf");
    const buf = await readFile(p);
    cachedBlank = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return cachedBlank;
  } catch { return null; }
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
  size?: number; bold?: boolean; color?: ReturnType<typeof rgb>;
  leading?: number; spaceAfter?: number; maxWidth?: number; x?: number;
} = {}) {
  const size = opts.size ?? 11;
  const font = opts.bold ? ctx.bold : ctx.font;
  const color = opts.color ?? COLOR_TEXT;
  const leading = opts.leading ?? size * 1.35;
  const maxWidth = opts.maxWidth ?? TEXT_WIDTH;
  const x = opts.x ?? TEXT_LEFT;
  for (const line of wrap(text, font, size, maxWidth)) {
    ctx.page.drawText(line, { x, y: ctx.y, size, font, color });
    ctx.y -= leading;
  }
  if (opts.spaceAfter) ctx.y -= opts.spaceAfter;
}

export async function renderAgendaA3(opts: AgendaPdfOptions): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Briefpapier (A4) als Hintergrund auf A3 skaliert einbetten
  const blank = await loadBriefpapier();
  if (blank) {
    try {
      const src = await PDFDocument.load(blank);
      const [embedded] = await doc.embedPdf(src, [0]);
      // A4 (595x842) -> A3 (842x1191). Skalierung um sqrt(2).
      const scale = PAGE_W / embedded.width; // ~1.414
      page.drawPage(embedded, {
        x: 0, y: 0,
        xScale: scale, yScale: scale,
      });
    } catch { /* ignore - fallback bleibt weisser Hintergrund */ }
  }

  // === Inhalt ===
  const ctx: Ctx = { page, font, bold, y: PAGE_H - 220 };

  // "PROGRAMM" Eyebrow als Brand-Pill
  page.drawRectangle({
    x: TEXT_LEFT, y: ctx.y - 4, width: 110, height: 24,
    color: BRAND,
    borderColor: BRAND,
    borderWidth: 1,
  });
  page.drawText("PROGRAMM", {
    x: TEXT_LEFT + 18, y: ctx.y + 3,
    size: 10, font: bold, color: rgb(1, 1, 1),
  });
  ctx.y -= 40;

  // Titel
  drawText(ctx, opts.eventTitle, { bold: true, size: 26, spaceAfter: 14 });

  // Meta-Zeile
  const isTwoDay = !!(opts.day1Date && opts.day2Date);
  const dateLine = isTwoDay
    ? `${fmtDate(opts.day1Date)}  ·  ${fmtDate(opts.day2Date)}`
    : fmtDate(opts.day1Date);
  const metaParts = [dateLine];
  if (opts.startTime && opts.endTime) metaParts.push(`${opts.startTime} – ${opts.endTime} Uhr`);
  if (opts.location) metaParts.push(opts.location);
  drawText(ctx, metaParts.join("  ·  "), { size: 11, color: COLOR_MUTED, spaceAfter: 18 });

  // Kurzes Brand-Lineal
  page.drawLine({
    start: { x: TEXT_LEFT, y: ctx.y + 4 },
    end: { x: TEXT_LEFT + 60, y: ctx.y + 4 },
    thickness: 1.5, color: BRAND,
  });
  ctx.y -= 24;

  // === Agenda-Eintraege ===
  const TIME_COL = 130;
  const GAP = 24;
  const titleX = TEXT_LEFT + TIME_COL + GAP;
  const titleW = TEXT_RIGHT - titleX;

  function ensureSpace(needed: number) {
    if (ctx.y - needed < 110) {
      // Neue Seite mit gleichem Hintergrund
      const next = doc.addPage([PAGE_W, PAGE_H]);
      if (blank) {
        // embeddedPage existiert bereits im PDF - nochmal embedden:
        // bei pdf-lib genuegt aber das ID der vorherigen Embed nicht teilen,
        // wir embedden erneut.
        // Workaround: einfach weisser Hintergrund + minimal Stripe.
        next.drawRectangle({
          x: PAGE_W - STRIPE_W, y: 0, width: STRIPE_W, height: PAGE_H, color: BRAND,
        });
      }
      ctx.page = next;
      ctx.y = PAGE_H - 100;
    }
  }

  function drawDayHeader(label: string, date: Date | null) {
    ensureSpace(80);
    ctx.y -= 4;
    // Brand-soft Pill mit Brand-Kante links
    const pillH = 34;
    ctx.page.drawRectangle({
      x: TEXT_LEFT, y: ctx.y - pillH + 24, width: TEXT_RIGHT - TEXT_LEFT, height: pillH,
      color: BRAND_SOFT,
    });
    ctx.page.drawRectangle({
      x: TEXT_LEFT, y: ctx.y - pillH + 24, width: 5, height: pillH, color: BRAND,
    });
    ctx.page.drawText(label, {
      x: TEXT_LEFT + 16, y: ctx.y + 4,
      size: 14, font: bold, color: BRAND,
    });
    ctx.page.drawText(fmtDate(date), {
      x: TEXT_LEFT + 90, y: ctx.y + 6,
      size: 11, font, color: COLOR_MUTED,
    });
    ctx.y -= pillH + 14;
  }

  function drawItem(it: AgendaPdfItem, isLast: boolean) {
    // Hoehe vorab
    let titleSize = 13;
    const titleLines = wrap(it.title, bold, titleSize, titleW);
    const tH = titleLines.length * titleSize * 1.25;
    let extra = 0;
    if (it.speaker) extra += 14;
    if (it.description) {
      const dLines = wrap(it.description, font, 10.5, titleW);
      extra += dLines.length * 10.5 * 1.35 + 4;
    }
    const blockH = Math.max(38, tH + extra + 10);
    ensureSpace(blockH);

    const startY = ctx.y;
    // Zeit
    ctx.page.drawText(it.startTime, {
      x: TEXT_LEFT, y: startY,
      size: 15, font: bold, color: BRAND,
    });
    if (it.endTime) {
      ctx.page.drawText(`bis ${it.endTime}`, {
        x: TEXT_LEFT, y: startY - 18,
        size: 10, font, color: COLOR_LIGHT,
      });
    }
    // Titel
    let cy = startY;
    for (const line of titleLines) {
      ctx.page.drawText(line, { x: titleX, y: cy, size: titleSize, font: bold, color: COLOR_TEXT });
      cy -= titleSize * 1.25;
    }
    cy -= 2;
    if (it.speaker) {
      ctx.page.drawText(it.speaker, { x: titleX, y: cy, size: 10, font, color: COLOR_MUTED });
      cy -= 13;
    }
    if (it.description) {
      for (const line of wrap(it.description, font, 10.5, titleW)) {
        ctx.page.drawText(line, { x: titleX, y: cy, size: 10.5, font, color: COLOR_TEXT });
        cy -= 10.5 * 1.35;
      }
    }
    ctx.y = Math.min(startY - blockH, cy - 4);

    if (!isLast) {
      ctx.page.drawLine({
        start: { x: TEXT_LEFT, y: ctx.y + 6 },
        end: { x: TEXT_RIGHT, y: ctx.y + 6 },
        thickness: 0.4, color: rgb(0.88, 0.91, 0.94),
      });
      ctx.y -= 12;
    }
  }

  const day1Items = opts.items.filter((i) => i.day === 1);
  const day2Items = opts.items.filter((i) => i.day === 2);
  if (day1Items.length > 0) {
    if (isTwoDay) drawDayHeader("Tag 1", opts.day1Date);
    day1Items.forEach((it, i) => drawItem(it, i === day1Items.length - 1));
  }
  if (day2Items.length > 0) {
    ctx.y -= 16;
    drawDayHeader("Tag 2", opts.day2Date);
    day2Items.forEach((it, i) => drawItem(it, i === day2Items.length - 1));
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
