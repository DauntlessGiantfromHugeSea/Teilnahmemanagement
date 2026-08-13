// Rendert Zertifikat / Teilnahmebescheinigung als PDF.
//
// Hintergrund ist das offizielle FBA-Briefpapier in
// public/cert-templates/fba-blank.pdf - Logo, Markenstreifen und
// Adressblock kommen aus diesem PDF. Der Text wird drueber gelegt.

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFEmbeddedPage,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
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

/** Ein einzelnes zu druckendes Zertifikat. */
export interface CertificateSpec {
  type: CertificateType;
  number: string;
  data: CertificateData;
  validateUrl: string;
}

interface RenderOpts {
  /** Wenn true: nur die Text-Inhalte ohne FBA-Briefpapier-Hintergrund.
   *  Fuer Druck auf bereits vorgedrucktes Briefpapier. */
  noBackground?: boolean;
  /** Vorgeladene GF-Unterschrift-URL (vermeidet DB-Lookup bei Bulk-Druck). */
  gfSignatureUrlOverride?: string | null;
}

// Briefpapier, Schriften und Unterschrift werden EINMAL pro Dokument
// eingebettet und auf allen Seiten wiederverwendet. Frueher bekam jedes
// Zertifikat sein eigenes Dokument, das anschliessend per copyPages
// zusammenkopiert wurde - dabei landete das ~88 KB grosse Briefpapier
// einmal PRO SEITE in der Ausgabe (400 Zertifikate -> ~30 MB statt ~250 KB).
async function prepareShared(opts: RenderOpts) {
  const doc = await PDFDocument.create();
  const noBackground = !!opts.noBackground;

  let background: PDFEmbeddedPage | null = null;
  let pageW = PAGE_W;
  let pageH = PAGE_H;
  if (!noBackground) {
    const blankDoc = await PDFDocument.load(await loadBlank());
    const blankPage = blankDoc.getPage(0);
    // Die Vorlage ist nicht exakt A4 (606.6 x 853.2). Wir uebernehmen ihre
    // Masse, damit die Ausgabe identisch zu vorher bleibt - die Textkoordinaten
    // rechnen wie bisher mit den PAGE_W/PAGE_H-Konstanten.
    pageW = blankPage.getWidth();
    pageH = blankPage.getHeight();
    [background] = await doc.embedPdf(blankDoc, [0]);
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  // GF-Unterschrift gibt es nur bei "ohne Briefpapier" (bg=0) und nur fuer
  // ZERTIFIKATE. Die dokumentweit gueltige URL (Override bzw. Live-Wert aus
  // den AppSettings) einmal aufloesen; ist sie leer, entscheidet weiterhin
  // der Snapshot des einzelnen Zertifikats.
  let sharedSignatureUrl: string | undefined;
  if (noBackground) {
    if (opts.gfSignatureUrlOverride !== undefined) {
      sharedSignatureUrl = opts.gfSignatureUrlOverride || undefined;
    } else {
      try {
        const live = await getCertTexts();
        sharedSignatureUrl = live.gfSignatureUrl || undefined;
      } catch { /* faellt auf den Snapshot-Wert zurueck */ }
    }
  }

  // Gleiche Unterschrift = gleiches eingebettetes Bild, auch bei 400 Seiten.
  const signatures = new Map<string, PDFImage | null>();

  return {
    doc, background, pageW, pageH, font, bold, italic,
    noBackground, sharedSignatureUrl, signatures,
  };
}

type Shared = Awaited<ReturnType<typeof prepareShared>>;

async function embedSignature(shared: Shared, url: string | undefined): Promise<PDFImage | null> {
  if (!url || !url.startsWith("/uploads/")) return null;
  const cached = shared.signatures.get(url);
  if (cached !== undefined) return cached;

  let img: PDFImage | null = null;
  try {
    const localPath = path.join(process.cwd(), "public", url);
    const bytes = new Uint8Array(await readFile(localPath));
    img = localPath.toLowerCase().endsWith(".png")
      ? await shared.doc.embedPng(bytes)
      : await shared.doc.embedJpg(bytes);
  } catch {
    img = null; // ohne Unterschrift, nur mit Namen, weiterdrucken
  }
  shared.signatures.set(url, img);
  return img;
}

async function addCertificatePage(shared: Shared, spec: CertificateSpec): Promise<void> {
  const page = shared.doc.addPage([shared.pageW, shared.pageH]);
  if (shared.background) {
    page.drawPage(shared.background, { x: 0, y: 0, width: shared.pageW, height: shared.pageH });
  }

  // Der Titel ("Zertifikat / Flüssigboden") sitzt entweder auf der Vorlage
  // ODER auf dem Vor-Druck-Briefpapier - in keiner Variante drucken wir ihn
  // also nochmal. Beide Varianten starten an derselben Y-Position, damit der
  // Inhalt auf dem Vor-Druck-Briefpapier genauso ausgerichtet ist wie bei der
  // Variante mit eingebettetem Hintergrund.
  const ctx: DrawCtx = {
    page,
    font: shared.font,
    bold: shared.bold,
    italic: shared.italic,
    y: PAGE_H - 250,
  };

  if (spec.type === "ZERTIFIKAT") {
    const url = shared.noBackground
      ? shared.sharedSignatureUrl ?? { ...DEFAULT_CERT_TEXTS, ...(spec.data.texts ?? {}) }.gfSignatureUrl
      : undefined;
    renderZertifikat(ctx, spec.data, spec.number, shared.noBackground, await embedSignature(shared, url));
  } else {
    renderTeilnahme(ctx, spec.data, spec.number);
  }

  // Validierungs-Fuesschen wird IMMER gezeichnet (auch bei Briefpapier-Druck)
  drawIdFooter(page, shared.font, spec.number, spec.validateUrl);
}

/** Mehrere Zertifikate in EIN PDF - Briefpapier wird nur einmal eingebettet. */
export async function renderCertificatesPdf(
  specs: CertificateSpec[],
  opts: RenderOpts = {},
): Promise<Uint8Array> {
  const shared = await prepareShared(opts);
  for (const spec of specs) await addCertificatePage(shared, spec);
  return shared.doc.save();
}

export async function renderCertificatePdf(
  args: CertificateSpec & RenderOpts,
): Promise<Uint8Array> {
  const { noBackground, gfSignatureUrlOverride, ...spec } = args;
  return renderCertificatesPdf([spec], { noBackground, gfSignatureUrlOverride });
}

function renderZertifikat(
  ctx: DrawCtx,
  d: CertificateData,
  number: string,
  noBackground: boolean,
  signature: PDFImage | null,
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

  // GF-Unterschrift nur bei "ohne Briefpapier" (bg=0) und nur fuer ZERTIFIKATE.
  // Aufloesen und Einbetten passiert einmal pro Dokument in prepareShared().
  if (noBackground && signature) {
    const sw = 106;                               // ~3.75 cm breit (33% groesser als zuvor)
    const sh = (signature.height / signature.width) * sw;
    // Viele Signatur-PNGs haben oben/unten viel Weissraum. Wir lassen
    // die Box bewusst die Namenszeile leicht ueberlappen und schieben
    // ctx.y nur um die HALBE Bildhoehe ab. So sitzt die sichtbare
    // Unterschrift visuell direkt ueber dem Namen, ohne grosse Luecke.
    ctx.page.drawImage(signature, {
      x: TEXT_LEFT,
      y: ctx.y - sh / 2 + 4,
      width: sw, height: sh,
    });
    ctx.y -= sh / 2 + 4;
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
