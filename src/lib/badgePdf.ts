import PDFDocument from "pdfkit";
import type { BadgeTemplate } from "./badgeTemplates";

const MM_TO_PT = 2.834645669;

export interface BadgeItem {
  name: string;     // bereits zusammengesetzt: "Vorname Nachname"
  company?: string;
}

interface BadgePdfOptions {
  template: BadgeTemplate;
  items: BadgeItem[];
  logoBuffer?: Buffer | null;   // optional, oben links
  brandColor?: [number, number, number]; // Default tuerkis
  eventTitle?: string;          // fuer Logging/Header optional
}

// Logo wird einmalig per HTTP geladen und im Speicher gecached.
let cachedLogo: { url: string; buf: Buffer } | null = null;

export async function loadLogoBuffer(url?: string): Promise<Buffer | null> {
  if (!url) return null;
  if (cachedLogo && cachedLogo.url === url) return cachedLogo.buf;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    const buf = Buffer.from(ab);
    cachedLogo = { url, buf };
    return buf;
  } catch {
    return null;
  }
}

// Findet die groesste einheitliche Schriftgroesse, bei der alle Namen
// in maxWidth (in pt) passen, ohne abgeschnitten zu werden.
function findUniformFontSize(
  doc: PDFKit.PDFDocument,
  font: string,
  names: string[],
  maxWidth: number,
  startSize = 22,
  minSize = 9
): number {
  doc.font(font);
  let size = startSize;
  while (size >= minSize) {
    doc.fontSize(size);
    let ok = true;
    for (const n of names) {
      if (doc.widthOfString(n) > maxWidth) {
        ok = false;
        break;
      }
    }
    if (ok) return size;
    size -= 1;
  }
  return minSize;
}

export async function renderBadgePdf(opts: BadgePdfOptions): Promise<Buffer> {
  const { template: t, items, logoBuffer } = opts;
  const brand = opts.brandColor ?? [0, 126, 128];

  const pageW = t.page.w * MM_TO_PT;
  const pageH = t.page.h * MM_TO_PT;
  const marginL = t.margins.left * MM_TO_PT;
  const marginT = t.margins.top * MM_TO_PT;
  const labelW = t.labelW * MM_TO_PT;
  const labelH = t.labelH * MM_TO_PT;
  const colGap = t.colGap * MM_TO_PT;
  const rowGap = t.rowGap * MM_TO_PT;
  const perPage = t.cols * t.rows;

  const doc = new PDFDocument({
    size: [pageW, pageH],
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    info: { Title: `Namensschilder ${t.id}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((res) => doc.on("end", () => res()));

  // Einheitliche Namens-Schriftgroesse ueber alle Etiketten
  // Inneren Padding pro Etikett: 4mm horizontal -> 8mm Abzug
  const innerPad = 6 * MM_TO_PT;     // Platz fuer Logo oben links und Padding
  const nameMaxW = labelW - 2 * (4 * MM_TO_PT); // 4mm links/rechts
  const names = items.map((i) => i.name);
  const nameSize = names.length
    ? findUniformFontSize(doc, "Helvetica-Bold", names, nameMaxW, 22, 9)
    : 22;
  const companySize = Math.max(8, Math.min(12, Math.round(nameSize * 0.55)));

  function drawBadge(x: number, y: number, item: BadgeItem | null) {
    // Optional: feiner Rahmen zur Stanzkontrolle (nur sehr dezent)
    // doc.save(); doc.rect(x, y, labelW, labelH).lineWidth(0.25).strokeColor(220,220,220).stroke(); doc.restore();
    if (!item) return;

    // Logo oben links
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, x + 4 * MM_TO_PT, y + 3 * MM_TO_PT, {
          fit: [14 * MM_TO_PT, 10 * MM_TO_PT],
        });
      } catch {
        // Fallback: Textmarke
      }
    }

    // Name fett, zentriert, vertikal mittig
    const nameY = y + labelH / 2 - nameSize / 2 - 2;
    doc.save();
    doc.font("Helvetica-Bold").fontSize(nameSize).fillColor("#0f172a");
    doc.text(item.name, x + 4 * MM_TO_PT, nameY, {
      width: labelW - 2 * (4 * MM_TO_PT),
      align: "center",
      lineBreak: false,
    });
    doc.restore();

    // Firma kleiner, duenner, unter dem Namen
    if (item.company && item.company.trim()) {
      const companyY = nameY + nameSize + 6;
      doc.save();
      doc.font("Helvetica").fontSize(companySize).fillColor("#475569");
      doc.text(item.company.trim(), x + 4 * MM_TO_PT, companyY, {
        width: labelW - 2 * (4 * MM_TO_PT),
        align: "center",
        lineBreak: false,
        ellipsis: true,
      });
      doc.restore();
    }
  }

  // Suppress unused var lint
  void innerPad;
  void brand;

  for (let i = 0; i < Math.max(1, items.length); i += perPage) {
    if (i > 0) doc.addPage({ size: [pageW, pageH], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
    for (let cell = 0; cell < perPage; cell++) {
      const idx = i + cell;
      const col = cell % t.cols;
      const row = Math.floor(cell / t.cols);
      const x = marginL + col * (labelW + colGap);
      const y = marginT + row * (labelH + rowGap);
      drawBadge(x, y, items[idx] ?? null);
    }
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
