// A3-Plakat der Agenda im FBA-Briefpapier-Design (gleich wie die Zertifikate):
// Logo oben links, Brand-Streifen rechts, Adress-Footer unten. Kein Timeline-
// Strang, sondern eine ruhige, zweispaltige Liste mit der Brand-Farbe als
// einzigem Akzent.

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
const MARGIN_L = 70;
const MARGIN_R = 70;
const STRIPE_W = 16;   // schmaler Brand-Streifen rechts (wie bei Zertifikat)

// FBA-Brand
const BRAND: [number, number, number] = [15, 118, 110];   // #0f766e teal
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#475569";
const TEXT_LIGHT = "#64748b";
const RULE = "#e2e8f0";

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
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((res) => doc.on("end", () => res()));

  const contentLeft = MARGIN_L;
  const contentRight = PAGE_W - MARGIN_R - STRIPE_W;
  const contentWidth = contentRight - contentLeft;
  const brandRgb = `rgb(${BRAND.join(",")})`;

  function drawChrome() {
    // Brand-Streifen rechts (wie Zertifikat)
    doc.save();
    doc.rect(PAGE_W - STRIPE_W, 0, STRIPE_W, PAGE_H).fill(brandRgb);
    doc.restore();

    // Logo oben links
    if (opts.logoBuffer) {
      try {
        doc.image(opts.logoBuffer, MARGIN_L, 50, { fit: [150, 70] });
      } catch { /* ignore */ }
    }

    // Adress-Footer
    doc
      .fillColor(TEXT_DARK)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text("Flüssigboden Akademie UG", MARGIN_L, PAGE_H - 70, { lineBreak: false });
    doc
      .fillColor(TEXT_LIGHT)
      .font("Helvetica")
      .fontSize(8.5)
      .text("Merseburger Str. 189", MARGIN_L, PAGE_H - 58, { lineBreak: false })
      .text("04179 Leipzig", MARGIN_L, PAGE_H - 46, { lineBreak: false })
      .text("info@fb-akademie.de", MARGIN_L, PAGE_H - 34, { lineBreak: false });

    const midX = MARGIN_L + 280;
    doc
      .fillColor(TEXT_LIGHT)
      .font("Helvetica")
      .fontSize(8.5)
      .text("Geschäftsführer:", midX, PAGE_H - 58, { lineBreak: false });
    doc
      .fillColor(TEXT_DARK)
      .font("Helvetica")
      .fontSize(8.5)
      .text("M.Sc. Wolf-Hagen Stolzenburg", midX, PAGE_H - 46, { lineBreak: false });
    doc
      .fillColor(TEXT_LIGHT)
      .font("Helvetica")
      .fontSize(8.5)
      .text("www.fb-akademie.de", midX, PAGE_H - 34, { lineBreak: false });
  }

  drawChrome();

  // Titel-Block
  let y = 170;
  doc
    .fillColor(TEXT_LIGHT)
    .font("Helvetica")
    .fontSize(10)
    .text("PROGRAMM", contentLeft, y, { lineBreak: false, characterSpacing: 2 });
  y += 14;
  doc
    .fillColor(TEXT_DARK)
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(opts.eventTitle, contentLeft, y, { width: contentWidth, lineBreak: true });
  y += doc.heightOfString(opts.eventTitle, { width: contentWidth }) + 12;

  const isTwoDay = !!(opts.day1Date && opts.day2Date);
  const dateLine = isTwoDay
    ? `${fmtDate(opts.day1Date)}  ·  ${fmtDate(opts.day2Date)}`
    : fmtDate(opts.day1Date);
  const metaParts = [dateLine];
  if (opts.startTime && opts.endTime) metaParts.push(`${opts.startTime} – ${opts.endTime} Uhr`);
  if (opts.location) metaParts.push(opts.location);
  doc
    .fillColor(TEXT_MUTED)
    .font("Helvetica")
    .fontSize(11)
    .text(metaParts.join("  ·  "), contentLeft, y, { width: contentWidth, lineBreak: true });
  y += doc.heightOfString(metaParts.join("  ·  "), { width: contentWidth }) + 20;

  // Trennlinie unter dem Header
  doc
    .save()
    .strokeColor(brandRgb)
    .lineWidth(1.2)
    .moveTo(contentLeft, y)
    .lineTo(contentLeft + 60, y)
    .stroke()
    .restore();
  y += 28;

  // === Agenda-Eintraege ===
  const TIME_COL = 130;   // Zeit-Spalte links
  const GAP = 24;
  const titleX = contentLeft + TIME_COL + GAP;
  const titleW = contentRight - titleX;

  function ensurePageSpace(needed: number) {
    if (y + needed > PAGE_H - 100) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
      drawChrome();
      y = 170;
    }
  }

  function drawDayHeader(label: string, date: Date | null) {
    ensurePageSpace(60);
    y += 6;
    doc
      .fillColor(brandRgb)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(label, contentLeft, y, { lineBreak: false, characterSpacing: 1 });
    doc
      .fillColor(TEXT_LIGHT)
      .font("Helvetica")
      .fontSize(11)
      .text(fmtDate(date), contentLeft + 80, y + 2, { lineBreak: false });
    y += 22;
    // Linie unter Tagesheader
    doc
      .save()
      .strokeColor(RULE)
      .lineWidth(0.5)
      .moveTo(contentLeft, y)
      .lineTo(contentRight, y)
      .stroke()
      .restore();
    y += 14;
  }

  function drawItem(it: AgendaPdfItem, isLast: boolean) {
    // Hoehe vorab grob abschaetzen (Title + Speaker + Description)
    doc.font("Helvetica-Bold").fontSize(13);
    const tH = doc.heightOfString(it.title, { width: titleW });
    let extra = 0;
    if (it.speaker) {
      doc.font("Helvetica-Oblique").fontSize(10);
      extra += doc.heightOfString(it.speaker, { width: titleW }) + 3;
    }
    if (it.description) {
      doc.font("Helvetica").fontSize(10);
      extra += doc.heightOfString(it.description, { width: titleW }) + 6;
    }
    const blockH = Math.max(34, tH + extra + 12);
    ensurePageSpace(blockH);

    // Zeit links, brand-color
    doc
      .fillColor(brandRgb)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(it.startTime, contentLeft, y, { width: TIME_COL, lineBreak: false });
    if (it.endTime) {
      doc
        .fillColor(TEXT_LIGHT)
        .font("Helvetica")
        .fontSize(10)
        .text(`bis ${it.endTime}`, contentLeft, y + 19, { width: TIME_COL, lineBreak: false });
    }

    // Titel + Speaker + Beschreibung rechts
    let cy = y;
    doc
      .fillColor(TEXT_DARK)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(it.title, titleX, cy, { width: titleW, lineBreak: true });
    cy += tH + 4;
    if (it.speaker) {
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica-Oblique")
        .fontSize(10)
        .text(it.speaker, titleX, cy, { width: titleW, lineBreak: true });
      cy += doc.heightOfString(it.speaker, { width: titleW }) + 4;
    }
    if (it.description) {
      doc
        .fillColor(TEXT_DARK)
        .font("Helvetica")
        .fontSize(10.5)
        .text(it.description, titleX, cy, { width: titleW, lineBreak: true });
      cy += doc.heightOfString(it.description, { width: titleW }) + 4;
    }

    const used = Math.max(blockH, cy - y);
    y += used + 4;

    if (!isLast) {
      doc
        .save()
        .strokeColor(RULE)
        .lineWidth(0.4)
        .moveTo(contentLeft, y)
        .lineTo(contentRight, y)
        .stroke()
        .restore();
      y += 14;
    }
  }

  const day1Items = opts.items.filter((i) => i.day === 1);
  const day2Items = opts.items.filter((i) => i.day === 2);

  if (day1Items.length > 0) {
    if (isTwoDay) drawDayHeader("Tag 1", opts.day1Date);
    day1Items.forEach((it, i) => drawItem(it, i === day1Items.length - 1));
  }
  if (day2Items.length > 0) {
    y += 14;
    drawDayHeader("Tag 2", opts.day2Date);
    day2Items.forEach((it, i) => drawItem(it, i === day2Items.length - 1));
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
