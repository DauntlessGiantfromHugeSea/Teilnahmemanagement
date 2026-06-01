import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAccounting } from "@/lib/rbac";
import { decryptParticipant } from "@/lib/participants";
import { basePriceCents, finalPriceCents } from "@/lib/pricing";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE");
}

function dayOptionLabel(opt: string): string {
  if (opt === "DAY_1") return "Tag 1";
  if (opt === "DAY_2") return "Tag 2";
  return "Beide Tage";
}

function parseEventIds(raw: string | null): string[] | "ALL" {
  if (!raw || raw === "ALL") return "ALL";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return "ALL";
  return ids;
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const s = await getSession();
  if (!s || !isAccounting(s)) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  let eventIdsParam = url.searchParams.get("eventIds");

  // Auch FormData (POST) akzeptieren - mehrere "eventIds" Felder zulassen
  let formIds: string[] | null = null;
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("form")) {
      const f = await req.formData();
      const all = f.getAll("eventIds").map((v) => String(v));
      if (all.length > 0) formIds = all;
      const single = f.get("eventIdsCsv");
      if (typeof single === "string" && single.length > 0) eventIdsParam = single;
    }
  }
  const eventIds = formIds && formIds.length > 0
    ? (formIds.includes("ALL") ? "ALL" : formIds)
    : parseEventIds(eventIdsParam);

  const events = await prisma.event.findMany({
    where: eventIds === "ALL" ? {} : { id: { in: eventIds } },
    include: { training: true },
    orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
  });

  if (events.length === 0) {
    return new NextResponse("Keine Veranstaltungen gefunden.", { status: 404 });
  }

  const parts = await prisma.participant.findMany({
    where: {
      status: { not: "CANCELLED" },
      eventId: { in: events.map((e) => e.id) },
    },
    include: { event: { include: { training: true } } },
    orderBy: [{ event: { day1Date: "desc" } }, { createdAt: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "FB-Akademie Teilnahmemanagement";
  wb.created = new Date();

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Veranstaltung", key: "event", width: 36 },
    { header: "1. Tag", key: "day1", width: 12 },
    { header: "2. Tag", key: "day2", width: 12 },
    { header: "Tagewahl", key: "dayOption", width: 12 },
    { header: "Nachname", key: "lastName", width: 18 },
    { header: "Vorname", key: "firstName", width: 16 },
    { header: "E-Mail", key: "email", width: 28 },
    { header: "Telefon", key: "phone", width: 16 },
    { header: "Firma", key: "company", width: 24 },
    { header: "Straße", key: "street", width: 24 },
    { header: "PLZ", key: "zip", width: 8 },
    { header: "Ort", key: "city", width: 18 },
    { header: "Land", key: "country", width: 10 },
    { header: "Kostenstelle", key: "costCenter", width: 14 },
    { header: "RE-Firma", key: "billingCompany", width: 24 },
    { header: "RE-Name", key: "billingName", width: 20 },
    { header: "RE-Straße", key: "billingStreet", width: 24 },
    { header: "RE-PLZ/Ort", key: "billingZipCity", width: 20 },
    { header: "RE-E-Mail", key: "billingEmail", width: 28 },
    { header: "Grundpreis (EUR)", key: "base", width: 14 },
    { header: "Rabatt %", key: "discount", width: 10 },
    { header: "Endpreis (EUR)", key: "final", width: 14 },
    { header: "RE-Status", key: "invoiceStatus", width: 14 },
    { header: "Anmeldung", key: "createdAt", width: 16 },
  ];

  function fillSheet(ws: ExcelJS.Worksheet, rows: typeof parts) {
    ws.columns = columns;
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = { vertical: "middle" };
    header.height = 22;
    header.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F766E" },
      };
      cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });

    let sumFinal = 0;
    for (const p of rows) {
      const dec = decryptParticipant(p);
      const base = basePriceCents(p.event.training, p.dayOption);
      const finalCents = finalPriceCents(base, p.discountBps);
      sumFinal += finalCents;
      ws.addRow({
        event: p.event.title,
        day1: fmtDate(p.event.day1Date),
        day2: fmtDate(p.event.day2Date),
        dayOption: dayOptionLabel(p.dayOption),
        lastName: dec.lastName ?? "",
        firstName: dec.firstName ?? "",
        email: dec.email ?? "",
        phone: dec.phone ?? "",
        company: dec.company ?? "",
        street: dec.street ?? "",
        zip: dec.zip ?? "",
        city: dec.city ?? "",
        country: dec.country ?? "",
        costCenter: dec.costCenter ?? "",
        billingCompany: dec.billingCompany ?? "",
        billingName: dec.billingName ?? "",
        billingStreet: dec.billingStreet ?? "",
        billingZipCity: dec.billingZipCity ?? "",
        billingEmail: dec.billingEmail ?? "",
        base: base / 100,
        discount: p.discountBps / 100,
        final: finalCents / 100,
        invoiceStatus: p.invoiceStatus,
        createdAt: fmtDate(p.createdAt),
      });
    }

    // EUR-Spalten formatieren
    ["base", "final"].forEach((k) => {
      const col = ws.getColumn(k);
      col.numFmt = '#,##0.00 "€"';
      col.alignment = { horizontal: "right" };
    });
    ws.getColumn("discount").numFmt = '0.00 "%"';
    ws.getColumn("discount").alignment = { horizontal: "right" };

    // Summenzeile
    if (rows.length > 0) {
      const total = ws.addRow({
        event: `Summe (${rows.length} TN)`,
        final: sumFinal / 100,
      });
      total.font = { bold: true };
      total.eachCell((cell) => {
        cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
      });
    }

    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  // Übersichtsblatt (alle Veranstaltungen zusammen)
  const overview = wb.addWorksheet("Alle");
  fillSheet(overview, parts);

  // Pro Veranstaltung ein eigenes Blatt
  for (const ev of events) {
    const rows = parts.filter((p) => p.eventId === ev.id);
    const safe = ev.title.replace(/[\\/?*\[\]:]/g, " ").slice(0, 28).trim() || "Veranstaltung";
    let name = safe;
    let i = 2;
    while (wb.worksheets.some((w) => w.name === name)) {
      name = `${safe} (${i++})`.slice(0, 31);
    }
    const ws = wb.addWorksheet(name);
    fillSheet(ws, rows);
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  const fname = `buchhaltung_${stamp}.xlsx`;
  const body = new Uint8Array(buf as ArrayBuffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
