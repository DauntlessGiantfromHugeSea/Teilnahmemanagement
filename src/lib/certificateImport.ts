// Import historischer Zertifikate aus der bestehenden FBA-Excel-Datei.
//
// Die Excel hat zwei relevante Sheets:
//   Sheet 2 = Zertifikate (mit Kompetenzfeld)
//     Spalten: ID | Zertifikats-ID | Ausgestellt am | gültig bis | Name | Vorname |
//              Aussteller | Schulungsort | Schulungsleiter | Datum Schulung |
//              Kompetenzfeld | Kopffeld | Textblock 1..3
//   Sheet 3 = Teilnahmebescheinigungen
//     Spalten: ID | Zertifikatsnummer | Ausgestellt am | Name | Vorname |
//              Fa. Teilnehmer | Datum Schulung | Schulungsort | Schulungsleiter |
//              p/o | Titel

import ExcelJS from "exceljs";
import { prisma } from "./db";
import { buildCertificateNumber, numberToSlug, type CertificateData } from "./certificateContent";
import { getCertTexts } from "./kompetenzfelder";

function fmtDateShort(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function excelDateToJs(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial -> JS Date (1900-01-01 = 1, mit Lotus-Bug bei 1900-02-29)
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  if (typeof v === "string" && /^\d+$/.test(v)) {
    return excelDateToJs(parseInt(v, 10));
  }
  return null;
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  // ExcelJS richtext etc.
  if (typeof v === "object" && "richText" in (v as any)) {
    const rt = (v as any).richText as Array<{ text: string }>;
    return rt.map((p) => p.text).join("").trim();
  }
  if (typeof v === "object" && "text" in (v as any)) {
    return String((v as any).text).trim();
  }
  return String(v).trim();
}

function initials(lastName: string, firstName: string): string {
  const ln = lastName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "")[0] ?? "X";
  const fn = firstName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "")[0] ?? "X";
  return (ln + fn).toUpperCase();
}

export interface ImportResult {
  zCount: number;
  tnCount: number;
  skipped: number;
  errors: string[];
}

export async function importFromXlsx(buffer: ArrayBuffer, createdById: string): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const texts = await getCertTexts();

  const result: ImportResult = { zCount: 0, tnCount: 0, skipped: 0, errors: [] };

  // Sheet-Index: ExcelJS ist 1-basiert (worksheets[0] ist Sheet 1)
  const zSheet = wb.worksheets[1]; // Sheet 2
  const tnSheet = wb.worksheets[2]; // Sheet 3

  // Sequenz-Tracker, um eindeutige Nummern zu vergeben falls keine vorhanden.
  const usedNumbers = new Set<string>(
    (await prisma.certificate.findMany({ select: { number: true } })).map((c) => c.number)
  );

  const allPromises: Promise<void>[] = [];

  // --- Zertifikate (Sheet 2) ---
  if (zSheet) {
    zSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Header
      const ausgestellt = excelDateToJs(row.getCell("C").value);
      const gueltigBis = excelDateToJs(row.getCell("D").value);
      const lastName = s(row.getCell("E").value);
      const firstName = s(row.getCell("F").value);
      const aussteller = s(row.getCell("G").value);
      const schulungsort = s(row.getCell("H").value);
      const schulungsleiter = s(row.getCell("I").value);
      const datumSchulung = excelDateToJs(row.getCell("J").value);
      const kompetenzfeldLabel = s(row.getCell("K").value);
      const kopffeld = s(row.getCell("L").value);
      const textblock1 = s(row.getCell("M").value);

      if (!lastName && !firstName) return; // Leere Zeilen ueberspringen

      const zertNum = s(row.getCell("B").value);
      let number = zertNum;
      if (!number) {
        // Sollte selten der Fall sein - generieren
        const year = (ausgestellt ?? new Date()).getFullYear();
        const yy = String(year % 100).padStart(2, "0");
        let seq = 1;
        while (usedNumbers.has(`${yy}-${initials(lastName, firstName)}-FBA/${String(seq).padStart(3, "0")}`)) seq++;
        number = buildCertificateNumber({ year, firstName, lastName, sequence: seq });
      }
      if (usedNumbers.has(number)) {
        result.skipped++;
        return;
      }
      usedNumbers.add(number);

      const data: CertificateData = {
        firstName,
        lastName,
        eventTitle: kopffeld || aussteller || "",
        trainingTitle: kompetenzfeldLabel || "",
        eventDateLine: datumSchulung ? fmtDateShort(datumSchulung) : "",
        eventDateShort: datumSchulung ? fmtDateShort(datumSchulung) : "",
        location: schulungsort,
        texts,
        issuedDateShort: ausgestellt ? fmtDateShort(ausgestellt) : "",
        validUntilShort: gueltigBis ? fmtDateShort(gueltigBis) : "",
        kompetenzfeld: kompetenzfeldLabel
          ? { id: kompetenzfeldLabel.split(".")[0]?.trim() || "?", label: kompetenzfeldLabel, text: textblock1 }
          : undefined,
      };

      allPromises.push(
        prisma.certificate
          .create({
            data: {
              number,
              slug: numberToSlug(number),
              participantId: null,
              type: "ZERTIFIKAT",
              status: "RELEASED",
              data: JSON.stringify(data),
              createdById,
              issuedAt: ausgestellt ?? undefined,
              releasedAt: ausgestellt ?? new Date(),
            },
          })
          .then(() => { result.zCount++; })
          .catch((e) => { result.errors.push(`Z Zeile ${rowNumber}: ${e?.message ?? e}`); })
      );
    });
  }

  // --- Teilnahmebescheinigungen (Sheet 3) ---
  if (tnSheet) {
    tnSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const ausgestellt = excelDateToJs(row.getCell("C").value);
      const lastName = s(row.getCell("D").value);
      const firstName = s(row.getCell("E").value);
      const company = s(row.getCell("F").value);
      const datumSchulung = excelDateToJs(row.getCell("G").value);
      const schulungsort = s(row.getCell("H").value);
      const titel = s(row.getCell("K").value);
      if (!lastName && !firstName) return;

      const zertNum = s(row.getCell("B").value);
      let number = zertNum;
      if (!number) {
        const year = (ausgestellt ?? new Date()).getFullYear();
        const yy = String(year % 100).padStart(2, "0");
        let seq = 1;
        while (usedNumbers.has(`${yy}-${initials(lastName, firstName)}-FBA/${String(seq).padStart(3, "0")}`)) seq++;
        number = buildCertificateNumber({ year, firstName, lastName, sequence: seq });
      }
      if (usedNumbers.has(number)) { result.skipped++; return; }
      usedNumbers.add(number);

      const data: CertificateData = {
        firstName,
        lastName,
        eventTitle: titel,
        trainingTitle: titel,
        eventDateLine: datumSchulung ? fmtDateShort(datumSchulung) : "",
        eventDateShort: datumSchulung ? fmtDateShort(datumSchulung) : "",
        location: schulungsort,
        texts,
        issuedDateShort: ausgestellt ? fmtDateShort(ausgestellt) : "",
        validUntilShort: "",
        bodyText: company ? `Firma: ${company}` : undefined,
      };

      allPromises.push(
        prisma.certificate
          .create({
            data: {
              number,
              slug: numberToSlug(number),
              participantId: null,
              type: "TEILNAHMEBESCHEINIGUNG",
              status: "RELEASED",
              data: JSON.stringify(data),
              createdById,
              issuedAt: ausgestellt ?? undefined,
              releasedAt: ausgestellt ?? new Date(),
            },
          })
          .then(() => { result.tnCount++; })
          .catch((e) => { result.errors.push(`TN Zeile ${rowNumber}: ${e?.message ?? e}`); })
      );
    });
  }

  await Promise.allSettled(allPromises);

  // Sequenz-Counter auf Maximum setzen, damit kuenftige Nummern nicht
  // mit importierten kollidieren.
  const maxRow = await prisma.certificate.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });
  if (maxRow) {
    const m = maxRow.number.match(/\/(\d+)$/);
    if (m) {
      const max = parseInt(m[1], 10);
      await prisma.appSetting.upsert({
        where: { key: "certSeq" },
        create: { key: "certSeq", value: String(max) },
        update: { value: String(max) },
      });
    }
  }

  return result;
}
