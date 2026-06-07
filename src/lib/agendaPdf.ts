// A3-Plakat der Agenda im FBA-Design. Wird ueber den Drucker fuer
// Vor-Ort-Auslage / Wandaushang genutzt.

import PDFDocument from "pdfkit";

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
  logoBuffer?: Buffer | null;
}

// A3 portrait
const PAGE_W = 842;
const PAGE_H = 1191;
const MARGIN = 50;

const BRAND_DARK: [number, number, number] = [15, 76, 73];     // #0f4c49 - dunkler Brand
const BRAND_MID: [number, number, number] = [15, 118, 110];    // #0f766e
const BRAND_LIGHT: [number, number, number] = [240, 253, 250]; // #f0fdfa
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#64748b";
const SLATE_200 = "#e2e8f0";

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export async function renderAgendaA3(opts: AgendaPdfOptions): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    info: { Title: `Agenda – ${opts.eventTitle}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((res) => doc.on("end", () => res()));

  // === Hero ===
  const heroH = 220;
  // Hintergrund-Gradient simulieren mit zwei Rechtecken
  doc.rect(0, 0, PAGE_W, heroH).fill(`rgb(${BRAND_DARK.join(",")})`);
  doc.save();
  doc.rect(0, 0, PAGE_W, heroH).fill(`rgb(${BRAND_MID.join(",")})`);
  doc.restore();
  // Akzent-Streifen rechts
  doc.rect(PAGE_W - 14, 0, 14, PAGE_H).fill(`rgb(${BRAND_DARK.join(",")})`);

  // Logo oben links
  if (opts.logoBuffer) {
    try {
      doc.image(opts.logoBuffer, MARGIN, 40, { fit: [120, 60] });
    } catch { /* ignore */ }
  }

  // Badge "Programm"
  doc
    .save()
    .roundedRect(MARGIN, 120, 100, 22, 11)
    .fill("rgba(255,255,255,0.18)")
    .restore();
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("PROGRAMM", MARGIN + 16, 126, { lineBreak: false });

  // Titel
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(32)
    .text(opts.eventTitle, MARGIN, 152, {
      width: PAGE_W - 2 * MARGIN - 14,
      lineBreak: true,
      ellipsis: true,
    });

  // === Datum / Ort - eigene Karte unter dem Hero ===
  const metaY = heroH + 24;
  doc
    .save()
    .roundedRect(MARGIN, metaY, PAGE_W - 2 * MARGIN - 14, 56, 12)
    .fillAndStroke("#ffffff", SLATE_200)
    .restore();

  const isTwoDay = !!(opts.day1Date && opts.day2Date);
  const dateLine = isTwoDay
    ? `${fmtDate(opts.day1Date)}  ·  ${fmtDate(opts.day2Date)}`
    : fmtDate(opts.day1Date);
  const timeLine = opts.startTime && opts.endTime ? `${opts.startTime} – ${opts.endTime} Uhr` : "";

  doc
    .fillColor(TEXT_DARK)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(dateLine, MARGIN + 20, metaY + 14, {
      width: PAGE_W - 2 * MARGIN - 60,
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .fillColor(TEXT_MUTED)
    .font("Helvetica")
    .fontSize(11)
    .text(
      [timeLine, opts.location].filter(Boolean).join("  ·  "),
      MARGIN + 20,
      metaY + 34,
      { width: PAGE_W - 2 * MARGIN - 60, lineBreak: false, ellipsis: true }
    );

  // === Agenda-Timeline ===
  let y = metaY + 56 + 32;
  const contentW = PAGE_W - 2 * MARGIN - 14;
  const timeCol = 100;   // Zeit-Spalte links
  const dotX = MARGIN + timeCol + 16;
  const lineX = dotX + 5; // Mitte des Dots

  const day1Items = opts.items.filter((i) => i.day === 1);
  const day2Items = opts.items.filter((i) => i.day === 2);

  function drawDayHeader(label: string) {
    doc
      .fillColor(`rgb(${BRAND_MID.join(",")})`)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(label.toUpperCase(), MARGIN, y, { width: contentW, lineBreak: false });
    y += 22;
  }

  function ensurePageSpace(needed: number) {
    if (y + needed > PAGE_H - 90) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
      // Akzent-Streifen auch auf Folgeseite
      doc.rect(PAGE_W - 14, 0, 14, PAGE_H).fill(`rgb(${BRAND_DARK.join(",")})`);
      y = MARGIN;
    }
  }

  function drawItems(items: AgendaPdfItem[]) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      ensurePageSpace(80);

      // Vertikale Linie (zwischen den Dots)
      if (i < items.length - 1) {
        doc
          .save()
          .lineWidth(1)
          .strokeColor(SLATE_200)
          .moveTo(lineX, y + 14)
          .lineTo(lineX, y + 80)
          .stroke()
          .restore();
      }

      // Dot
      doc
        .save()
        .lineWidth(2)
        .strokeColor(`rgb(${BRAND_MID.join(",")})`)
        .fillColor("#ffffff")
        .circle(lineX, y + 14, 5)
        .fillAndStroke()
        .restore();

      // Zeit links
      doc
        .fillColor(TEXT_DARK)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(it.startTime, MARGIN, y + 8, { width: timeCol, lineBreak: false });
      if (it.endTime) {
        doc
          .fillColor(TEXT_MUTED)
          .font("Helvetica")
          .fontSize(10)
          .text(`bis ${it.endTime}`, MARGIN, y + 26, { width: timeCol, lineBreak: false });
      }

      // Titel
      const textX = dotX + 30;
      const textW = PAGE_W - textX - MARGIN - 14;
      doc
        .fillColor(TEXT_DARK)
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(it.title, textX, y + 8, { width: textW, lineBreak: true });
      let lineH = doc.heightOfString(it.title, { width: textW });
      let cursor = y + 8 + lineH + 4;

      if (it.speaker) {
        doc
          .fillColor(TEXT_MUTED)
          .font("Helvetica-Oblique")
          .fontSize(10)
          .text(it.speaker, textX, cursor, { width: textW, lineBreak: false });
        cursor += 14;
      }
      if (it.description) {
        doc
          .fillColor(TEXT_DARK)
          .font("Helvetica")
          .fontSize(10)
          .text(it.description, textX, cursor, { width: textW, lineBreak: true });
        cursor += doc.heightOfString(it.description, { width: textW }) + 4;
      }

      const blockH = Math.max(60, cursor - y);
      y += blockH + 6;
    }
  }

  if (day1Items.length > 0) {
    if (isTwoDay) drawDayHeader(`Tag 1 — ${fmtDate(opts.day1Date)}`);
    drawItems(day1Items);
  }
  if (day2Items.length > 0) {
    ensurePageSpace(40);
    y += 12;
    drawDayHeader(`Tag 2 — ${fmtDate(opts.day2Date)}`);
    drawItems(day2Items);
  }

  // === Footer auf jeder Seite ===
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor(TEXT_MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Flüssigboden Akademie UG · Merseburger Str. 189 · 04179 Leipzig · www.fb-akademie.de",
        MARGIN,
        PAGE_H - 40,
        { width: PAGE_W - 2 * MARGIN - 14, align: "center", lineBreak: false }
      );
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
