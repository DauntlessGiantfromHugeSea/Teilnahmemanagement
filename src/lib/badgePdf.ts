import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { readFile } from "node:fs/promises";
import path from "node:path";
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
  /** Wenn gesetzt: nach jeder Vorderseite eine Rueckseite mit QR-Code zum Portal.
   *  Empfehlenswert um die Bogen duplex zu drucken. */
  portalUrl?: string;
  /** Duplex-Flip-Achse - 'long' (Standard, mirror Spalten) oder 'short' (mirror Reihen). */
  duplexFlip?: "long" | "short";
}

// Logo wird einmalig per HTTP geladen und im Speicher gecached.
let cachedLogo: { url: string; buf: Buffer } | null = null;

export async function loadLogoBuffer(url?: string): Promise<Buffer | null> {
  if (cachedLogo && cachedLogo.url === (url ?? "__local__")) return cachedLogo.buf;

  // 1) Externe URL versuchen
  if (url) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "image/png,image/jpeg,image/*" },
      });
      if (r.ok) {
        const ct = r.headers.get("content-type") ?? "";
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        // Magic-Number-Check, damit kein HTML-Errorbody als "Bild" landet
        const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        if ((isPng || isJpg) && ct.startsWith("image/")) {
          cachedLogo = { url, buf };
          return buf;
        }
      }
    } catch {
      /* Fallthrough auf lokale Datei */
    }
  }

  // 2) Fallback: lokales PNG aus public/
  try {
    const p = path.join(process.cwd(), "public", "logo-fba.png");
    const buf = await readFile(p);
    cachedLogo = { url: url ?? "__local__", buf };
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
  const portalUrl = opts.portalUrl?.trim() || "";
  const duplexFlip = opts.duplexFlip ?? "long";

  // QR-Code einmal vorab als PNG-Buffer rendern. Format: hohe Aufloesung
  // (margin=1, errorCorrectionLevel=M) - reicht fuer ~3cm-Druckgroesse.
  let qrPng: Buffer | null = null;
  if (portalUrl) {
    try {
      qrPng = await QRCode.toBuffer(portalUrl, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 600,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
    } catch {
      qrPng = null;
    }
  }

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

  // Layout-Strategie:
  //  - Logo klein oben links (10×8 mm) - laesst Platz fuer den Namen
  //  - Name fett, zentriert, im optisch mittleren Bereich des Etiketts
  //  - Firma kleiner darunter, mittel-grau
  // Schriftgroesse Name: einheitlich ueber alle Etiketten, max 16pt fuer
  // 90×60mm-Schilder (vorher 22pt - viel zu gross fuer eine Reihe von Namen)
  const innerPadX = 7 * MM_TO_PT;
  const nameMaxW = labelW - 2 * innerPadX;
  // Maximale Schriftgroesse aus Label-Hoehe ableiten: Faustregel ca. labelH/4.5
  const dynamicMaxName = Math.floor((labelH / MM_TO_PT) / 4.2);   // ~14pt bei 60mm
  const maxName = Math.min(16, Math.max(11, dynamicMaxName));
  const names = items.map((i) => i.name);
  const nameSize = names.length
    ? findUniformFontSize(doc, "Helvetica-Bold", names, nameMaxW, maxName, 9)
    : maxName;
  const companySize = Math.max(8, Math.min(11, Math.round(nameSize * 0.62)));

  function drawBadge(x: number, y: number, item: BadgeItem | null) {
    if (!item) return;

    // Logo klein oben links (10×8 mm)
    const logoW = 12 * MM_TO_PT;
    const logoH = 9 * MM_TO_PT;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, x + 4 * MM_TO_PT, y + 3 * MM_TO_PT, {
          fit: [logoW, logoH],
        });
      } catch {
        /* ignore */
      }
    }

    // Vertikal mittig im Etikett, leicht nach unten verschoben (unter dem Logo)
    // - Name + ggf. Firma als zusammenhaengender Block, optisch zentriert.
    const hasCompany = !!(item.company && item.company.trim());
    const blockH = nameSize + (hasCompany ? companySize + 5 : 0);
    const blockTopY = y + (labelH - blockH) / 2 + 2;

    doc.save();
    doc.font("Helvetica-Bold").fontSize(nameSize).fillColor("#0f172a");
    doc.text(item.name, x + innerPadX, blockTopY, {
      width: nameMaxW,
      align: "center",
      lineBreak: false,
      ellipsis: true,
    });
    doc.restore();

    if (hasCompany) {
      doc.save();
      doc.font("Helvetica").fontSize(companySize).fillColor("#475569");
      doc.text(item.company!.trim(), x + innerPadX, blockTopY + nameSize + 4, {
        width: nameMaxW,
        align: "center",
        lineBreak: false,
        ellipsis: true,
      });
      doc.restore();
    }
  }

  // QR-Rueckseite: rendert in jede Zelle einen QR-Code. Spalten oder Reihen
  // werden je nach Duplex-Flip-Achse gespiegelt, damit der QR-Code physisch
  // hinter dem zugehoerigen Namensschild landet.
  function drawQrCell(x: number, y: number, hasItem: boolean) {
    if (!qrPng || !hasItem) return;
    const padX = 8 * MM_TO_PT;
    const padY = 16 * MM_TO_PT;       // 1 cm tiefer als zuvor (war 6 mm)
    const captionH = 7 * MM_TO_PT;
    const maxW = labelW - 2 * padX;
    const maxH = labelH - 2 * padY - captionH;
    // QR-Code-Groesse: maximal ~28mm, damit Inhalt sicher im Etikett bleibt
    const qrMax = 28 * MM_TO_PT;
    const size = Math.min(maxW, maxH, qrMax);
    const qrX = x + (labelW - size) / 2;
    const qrY = y + padY;
    try {
      doc.image(qrPng, qrX, qrY, { fit: [size, size] });
    } catch {
      // ignore
    }
    // Untertitel zentriert unter dem QR-Code
    doc.save();
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a");
    doc.text("Schulungs-Portal", x + 4 * MM_TO_PT, qrY + size + 1.5 * MM_TO_PT, {
      width: labelW - 2 * (4 * MM_TO_PT),
      align: "center",
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(6).fillColor("#64748b");
    doc.text("QR scannen für Agenda & Infos", x + 4 * MM_TO_PT, qrY + size + 4.5 * MM_TO_PT, {
      width: labelW - 2 * (4 * MM_TO_PT),
      align: "center",
      lineBreak: false,
    });
    doc.restore();
  }

  // Suppress unused var lint
  void innerPadX;
  void brand;

  for (let i = 0; i < Math.max(1, items.length); i += perPage) {
    if (i > 0) doc.addPage({ size: [pageW, pageH], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
    // Vorderseite
    for (let cell = 0; cell < perPage; cell++) {
      const idx = i + cell;
      const col = cell % t.cols;
      const row = Math.floor(cell / t.cols);
      const x = marginL + col * (labelW + colGap);
      const y = marginT + row * (labelH + rowGap);
      drawBadge(x, y, items[idx] ?? null);
    }
    // Rueckseite (nur wenn QR-Code aktiviert)
    if (qrPng) {
      doc.addPage({ size: [pageW, pageH], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
      for (let cell = 0; cell < perPage; cell++) {
        const idx = i + cell;
        const col = cell % t.cols;
        const row = Math.floor(cell / t.cols);
        const mirroredCol = duplexFlip === "long" ? (t.cols - 1 - col) : col;
        const mirroredRow = duplexFlip === "short" ? (t.rows - 1 - row) : row;
        const x = marginL + mirroredCol * (labelW + colGap);
        const y = marginT + mirroredRow * (labelH + rowGap);
        drawQrCell(x, y, !!items[idx]);
      }
    }
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
