// CSV-Ausgabe.
//
// Zwei verschiedene Probleme, die beide hier geloest werden:
//
//  1. Feldtrennung: Zellen mit Trennzeichen, Anfuehrungszeichen oder
//     Zeilenumbruch gehoeren in Anfuehrungszeichen.
//  2. Formeln: Tabellenprogramme deuten eine Zelle, die mit =, +, -, @
//     oder einem Steuerzeichen beginnt, als Formel und fuehren sie beim
//     Oeffnen aus. Die Inhalte hier stammen aus oeffentlichen Formularen
//     (Newsletter-Anmeldung), sind also fremdbestimmt. Ein vorangestelltes
//     Apostroph nimmt der Zelle den Formelcharakter; es ist die von
//     Excel und LibreOffice verstandene Schreibweise fuer "das ist Text".

const FORMULA_START = /^[=+\-@\t\r]/;

/** Entschaerft eine Zelle, ohne sie zu kuerzen. */
export function csvSafeValue(v: string): string {
  return FORMULA_START.test(v) ? `'${v}` : v;
}

/** Entschaerft und quotet eine Zelle fuer die Ausgabe. */
export function csvCell(v: string | null | undefined, delimiter = ";"): string {
  const safe = csvSafeValue(String(v ?? ""));
  const needsQuotes = safe.includes(delimiter) || /["\n\r]/.test(safe);
  return needsQuotes ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Baut ein vollstaendiges CSV inklusive BOM (fuer Excel). */
export function toCsv(rows: (string | null | undefined)[][], delimiter = ";"): string {
  return "﻿" + rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join("\r\n");
}
