// Gemeinsamer Briefpapier-Hintergrund fuer alle erzeugten PDFs
// (Zertifikate, Briefe, Agenda, Anmeldebestaetigungen).
//
// Das Briefpapier wird pro Dokument GENAU EINMAL eingebettet und danach auf
// beliebig vielen Seiten gezeichnet. Vorher legte jedes Modul die Vorlage pro
// Seite bzw. pro Zertifikat neu an - bei einem Sammeldruck landete die Vorlage
// damit hunderte Male in derselben Datei (400 Zertifikate -> ~30 MB).
//
// Bewusst als Vektor-PDF und nicht als vorgerastertes PNG: der Briefkopf ist
// nur Logo, Markenstreifen und etwas Text. Gemessen an 40 Seiten war die
// PNG-Variante (150 DPI) beim Einbetten 18x langsamer und beim Anzeigen im
// Viewer rund 60% langsamer als der Vektor - ein A4-Rasterbild muss pro Seite
// dekomprimiert werden, die paar hundert Vektorbefehle nicht.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, type PDFEmbeddedPage } from "pdf-lib";

export type LetterheadName = "fba-blank" | "briefpapier-blank";

/** Masse der Vorlagen in PDF-Punkten (214 x 301 mm - A4 mit Anschnitt). */
export const LETTERHEAD_WIDTH = 606.614;
export const LETTERHEAD_HEIGHT = 853.228;

// Dateiinhalt einmal pro Prozess lesen.
const fileCache = new Map<LetterheadName, Uint8Array | null>();
// Pro PDF-Dokument nur EINE Einbettung, egal wie viele Seiten sie nutzen.
const docCache = new WeakMap<PDFDocument, Map<LetterheadName, PDFEmbeddedPage | null>>();

async function loadBytes(name: LetterheadName): Promise<Uint8Array | null> {
  const cached = fileCache.get(name);
  if (cached !== undefined) return cached;
  let bytes: Uint8Array | null = null;
  try {
    const p = path.join(process.cwd(), "public", "cert-templates", `${name}.pdf`);
    bytes = new Uint8Array(await readFile(p));
  } catch {
    bytes = null; // ohne Hintergrund weiterdrucken statt den Export zu verlieren
  }
  fileCache.set(name, bytes);
  return bytes;
}

/**
 * Bettet das Briefpapier in das Dokument ein und liefert die eingebettete
 * Seite zurueck. Mehrfachaufrufe fuer dasselbe Dokument liefern dieselbe
 * Einbettung - die Vorlage landet also genau einmal in der Ausgabedatei.
 */
export async function embedLetterhead(
  doc: PDFDocument,
  name: LetterheadName,
): Promise<PDFEmbeddedPage | null> {
  let perDoc = docCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    docCache.set(doc, perDoc);
  }
  const hit = perDoc.get(name);
  if (hit !== undefined) return hit;

  const bytes = await loadBytes(name);
  let embedded: PDFEmbeddedPage | null = null;
  if (bytes) {
    try {
      const src = await PDFDocument.load(bytes);
      [embedded] = await doc.embedPdf(src, [0]);
    } catch {
      embedded = null;
    }
  }
  perDoc.set(name, embedded);
  return embedded;
}
