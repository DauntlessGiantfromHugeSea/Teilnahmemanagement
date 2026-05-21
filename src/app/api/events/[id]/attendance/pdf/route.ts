import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canViewEvent } from "@/lib/rbac";
import { decryptParticipant } from "@/lib/participants";
import type { DayOption } from "@prisma/client";

export const runtime = "nodejs";

function dayLabel(d: DayOption) {
  return d === "DAY_1" ? "Tag 1" : d === "DAY_2" ? "Tag 2" : "Beide Tage";
}

// Firmenfarbe rgb(0, 126, 128)
const BRAND: [number, number, number] = [0, 126, 128];
const BRAND_TINT: [number, number, number] = [230, 242, 242];
const BORDER: [number, number, number] = [148, 163, 184];
const TEXT_MUTED: [number, number, number] = [100, 116, 139];
const TEXT: [number, number, number] = [15, 23, 42];

interface ColDef {
  key: "num" | "name" | "company" | "zip" | "city" | "remarks" | "sig";
  label: string;
  width: number;
}

const COLS: ColDef[] = [
  { key: "num", label: "Nr.", width: 30 },
  { key: "name", label: "Name", width: 160 },
  { key: "company", label: "Firma", width: 160 },
  { key: "zip", label: "PLZ", width: 50 },
  { key: "city", label: "Ort", width: 90 },
  { key: "remarks", label: "Bemerkungen", width: 130 },
  { key: "sig", label: "Unterschrift", width: 150 },
];

const MARGIN = 30;
const ROW_HEIGHT = 44;
const PAGE_W = 842; // A4 landscape pt
const PAGE_H = 595;
const CONTENT_W = COLS.reduce((s, c) => s + c.width, 0); // 770

// Firmenlogo aus public/logo.png laden und im Memory cachen.
// Falls die Datei fehlt, wird der Header schlicht ohne Logo gerendert.
let LOGO_CACHE: Buffer | null = null;
let LOGO_LOADED = false;
async function getLogo(): Promise<Buffer | null> {
  if (LOGO_LOADED) return LOGO_CACHE;
  LOGO_LOADED = true;
  for (const candidate of ["logo.png", "logo.jpg", "logo.jpeg"]) {
    try {
      const path = join(process.cwd(), "public", candidate);
      LOGO_CACHE = await readFile(path);
      return LOGO_CACHE;
    } catch {
      // weiter zum naechsten Kandidaten
    }
  }
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canViewEvent(s, params.id))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      training: true,
      participants: {
        where: { status: { not: "CANCELLED" } },
      },
    },
  });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const day = dayParam === "1" ? 1 : dayParam === "2" ? 2 : null;

  const all = ev.participants.map(decryptParticipant);
  const filtered = all.filter((p) => {
    if (day === 1) return p.dayOption === "DAY_1" || p.dayOption === "BOTH";
    if (day === 2) return p.dayOption === "DAY_2" || p.dayOption === "BOTH";
    return true;
  });
  filtered.sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? "", "de"));

  const dateLabel =
    day === 1 && ev.day1Date
      ? ev.day1Date.toLocaleDateString("de-DE")
      : day === 2 && ev.day2Date
      ? ev.day2Date.toLocaleDateString("de-DE")
      : [
          ev.day1Date?.toLocaleDateString("de-DE"),
          ev.day2Date?.toLocaleDateString("de-DE"),
        ]
          .filter(Boolean)
          .join(" - ") || "-";

  // PDF in einen Puffer streamen
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: MARGIN,
    info: {
      Title: `Anwesenheitsliste - ${ev.title}`,
      Author: "FB-Akademie",
    },
  });
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const startX = MARGIN;
  let y = MARGIN;

  // Firmenlogo oben rechts (best effort, ueberspringt bei Fehler)
  const logo = await getLogo();
  if (logo) {
    try {
      const logoH = 48;
      doc.image(logo, PAGE_W - MARGIN - 140, MARGIN, { height: logoH, fit: [140, logoH] });
    } catch {
      // Logo konnte nicht eingebettet werden, weitermachen ohne
    }
  }

  // Header
  doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(8);
  doc.text(
    `ANWESENHEITSLISTE${day ? ` - TAG ${day}` : ""}`,
    startX,
    y,
    { characterSpacing: 0.5 }
  );
  y += 14;
  doc.fillColor(rgb(TEXT)).font("Helvetica-Bold").fontSize(16).text(ev.title, startX, y);
  y += 22;
  doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(10).text(ev.training.title, startX, y);
  y += 16;

  // Meta-Block (Datum, Zeit, Ort)
  const metaStartY = y;
  const labelW = 50;
  const writeMeta = (label: string, value: string) => {
    doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(9).text(label, startX, y);
    doc.fillColor(rgb(TEXT)).font("Helvetica-Bold").fontSize(10).text(value, startX + labelW, y);
    y += 14;
  };
  writeMeta("Datum:", dateLabel);
  if (ev.startTime || ev.endTime) {
    writeMeta(
      "Zeit:",
      `${ev.startTime ?? "?"}${ev.endTime ? " - " + ev.endTime : ""} Uhr`
    );
  }
  if (ev.location) writeMeta("Ort:", ev.location);
  if (ev.format === "WEBINAR") writeMeta("Format:", "Webinar (online)");
  const metaEndY = y;

  // Teilnehmerzahl rechts
  doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(9).text(
    "TEILNEHMER",
    PAGE_W - MARGIN - 100,
    metaStartY,
    { width: 100, align: "right", characterSpacing: 0.5 }
  );
  doc.fillColor(rgb(BRAND)).font("Helvetica-Bold").fontSize(28).text(
    String(filtered.length),
    PAGE_W - MARGIN - 100,
    metaStartY + 10,
    { width: 100, align: "right" }
  );

  y = Math.max(metaEndY, metaStartY + 50) + 14;

  // Tabelle
  const tableStartY = y;
  drawTableHeader(doc, startX, y);
  y += 22;

  const totalRows = filtered.length + 4; // +4 Leerzeilen
  for (let i = 0; i < totalRows; i++) {
    if (y + ROW_HEIGHT > PAGE_H - MARGIN - 60) {
      // Footer-Reserve auf der Seite mit Footer; Seitenumbruch
      doc.addPage();
      y = MARGIN;
      drawTableHeader(doc, startX, y);
      y += 22;
    }
    const p = filtered[i];
    drawRow(doc, startX, y, i + 1, p, day === null, ev.day1Date, ev.day2Date);
    y += ROW_HEIGHT;
  }

  // Footer mit Unterschriftslinien (immer auf der letzten Seite)
  const footerY = PAGE_H - MARGIN - 40;
  if (y > footerY - 10) {
    // Wenn Tabelle zu nah am Rand: neue Seite fuer Footer
    doc.addPage();
  }
  const sigY = PAGE_H - MARGIN - 30;
  const halfW = (CONTENT_W - 40) / 2;
  doc
    .strokeColor(rgb(BORDER))
    .lineWidth(0.6)
    .moveTo(startX, sigY)
    .lineTo(startX + halfW, sigY)
    .stroke();
  doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(8).text(
    "Ort, Datum",
    startX,
    sigY + 4
  );
  doc
    .moveTo(startX + halfW + 40, sigY)
    .lineTo(startX + CONTENT_W, sigY)
    .stroke();
  doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(8).text(
    "Unterschrift Veranstaltungsleitung",
    startX + halfW + 40,
    sigY + 4
  );

  doc.end();
  const pdf = await done;

  const filename = `Anwesenheit_${slug(ev.title)}${day ? `_Tag${day}` : ""}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function rgb([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.fillColor(rgb(BRAND_TINT)).rect(x, y, CONTENT_W, 22).fill();
  doc.fillColor(rgb(BRAND)).font("Helvetica-Bold").fontSize(8);
  let cx = x;
  for (const c of COLS) {
    doc.text(c.label.toUpperCase(), cx + 6, y + 7, {
      width: c.width - 12,
      characterSpacing: 0.5,
    });
    cx += c.width;
  }
  doc.strokeColor(rgb(BORDER)).lineWidth(0.6);
  doc.rect(x, y, CONTENT_W, 22).stroke();
}

function drawRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  num: number,
  p: any | undefined,
  showDayBadge: boolean,
  day1?: Date | null,
  day2?: Date | null
) {
  // Vertikale Trenner + unterer Rahmen
  doc.strokeColor(rgb(BORDER)).lineWidth(0.4);
  let cx = x;
  for (const c of COLS) {
    doc.moveTo(cx, y).lineTo(cx, y + ROW_HEIGHT).stroke();
    cx += c.width;
  }
  doc.moveTo(x + CONTENT_W, y).lineTo(x + CONTENT_W, y + ROW_HEIGHT).stroke();
  doc.moveTo(x, y + ROW_HEIGHT).lineTo(x + CONTENT_W, y + ROW_HEIGHT).stroke();

  // Nummer
  cx = x;
  doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(9).text(
    String(num),
    cx + 4,
    y + 16,
    { width: COLS[0].width - 8, align: "center" }
  );
  cx += COLS[0].width;

  if (!p) return; // Leerzeile

  // Name
  const nameLine = `${p.lastName ?? ""}${p.firstName ? ", " + p.firstName : ""}`;
  doc.fillColor(rgb(TEXT)).font("Helvetica-Bold").fontSize(10).text(
    nameLine.trim(),
    cx + 6,
    y + 8,
    { width: COLS[1].width - 12, ellipsis: true }
  );
  if (showDayBadge) {
    const fmt = (d?: Date | null) => d ? d.toLocaleDateString("de-DE") : "";
    const dateLine =
      p.dayOption === "DAY_1"
        ? fmt(day1)
        : p.dayOption === "DAY_2"
        ? fmt(day2)
        : [fmt(day1), fmt(day2)].filter(Boolean).join(", ");
    if (dateLine) {
      doc.fillColor(rgb(TEXT_MUTED)).font("Helvetica").fontSize(8).text(
        dateLine,
        cx + 6,
        y + 24,
        { width: COLS[1].width - 12 }
      );
    }
  }
  cx += COLS[1].width;

  // Firma
  doc.fillColor(rgb(TEXT)).font("Helvetica").fontSize(10).text(
    p.company ?? "",
    cx + 6,
    y + 16,
    { width: COLS[2].width - 12, ellipsis: true }
  );
  cx += COLS[2].width;

  // PLZ
  doc.fillColor(rgb(TEXT)).font("Helvetica").fontSize(10).text(
    p.zip ?? "",
    cx + 6,
    y + 16,
    { width: COLS[3].width - 12 }
  );
  cx += COLS[3].width;

  // Ort
  doc.fillColor(rgb(TEXT)).font("Helvetica").fontSize(10).text(
    p.city ?? "",
    cx + 6,
    y + 16,
    { width: COLS[4].width - 12, ellipsis: true }
  );
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "event";
}
