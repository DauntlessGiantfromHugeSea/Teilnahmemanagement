import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin, isAccounting } from "@/lib/rbac";
import { decryptParticipant } from "@/lib/participants";
import { basePriceCents, finalPriceCents } from "@/lib/pricing";
import {
  EXPORT_FIELDS,
  DEFAULT_FIELDS,
  dayOptionLabel,
  statusLabel,
  invoiceStatusLabel,
  type ExportFieldKey,
} from "@/lib/exportFields";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE");
}
function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const ALL_KEYS = new Set<string>(EXPORT_FIELDS.map((f) => f.key));

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !(isAdmin(s) || isAccounting(s) || s.role === "EDITOR")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const f = await req.formData();

  const rawEventIds = f.getAll("eventIds").map((v) => String(v));
  const allEvents = rawEventIds.includes("ALL") || rawEventIds.length === 0;
  const eventIds = allEvents ? null : rawEventIds.filter(Boolean);

  const rawFields = f.getAll("fields").map((v) => String(v)) as ExportFieldKey[];
  const fields = rawFields.filter((k) => ALL_KEYS.has(k));
  const selectedKeys: ExportFieldKey[] = fields.length > 0 ? fields : DEFAULT_FIELDS;

  const includeCancelled = f.get("includeCancelled") === "on";
  const split = f.get("split") === "on";

  const events = await prisma.event.findMany({
    where: allEvents ? {} : { id: { in: eventIds ?? [] } },
    include: { training: true },
    orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
  });

  if (events.length === 0) {
    return new NextResponse("Keine Veranstaltungen ausgewählt.", { status: 400 });
  }

  const parts = await prisma.participant.findMany({
    where: {
      eventId: { in: events.map((e) => e.id) },
      ...(includeCancelled ? {} : { status: { not: "CANCELLED" } }),
    },
    include: { event: { include: { training: true } } },
    orderBy: [
      { event: { day1Date: "desc" } },
      { lastName: "asc" },
      { createdAt: "asc" },
    ],
  });

  const defs = selectedKeys
    .map((k) => EXPORT_FIELDS.find((d) => d.key === k))
    .filter((d): d is (typeof EXPORT_FIELDS)[number] => !!d);

  const wb = new ExcelJS.Workbook();
  wb.creator = "FB-Akademie Teilnahmemanagement";
  wb.created = new Date();

  function valueFor(
    key: ExportFieldKey,
    p: (typeof parts)[number],
    dec: ReturnType<typeof decryptParticipant>,
  ): string | number {
    const ev = p.event;
    switch (key) {
      case "eventTitle":    return ev.title;
      case "eventDay1":     return fmtDate(ev.day1Date);
      case "eventDay2":     return fmtDate(ev.day2Date);
      case "eventLocation": return ev.format === "WEBINAR" ? (ev.meetingUrl ? "Webinar" : "Webinar") : (ev.location ?? "");
      case "eventFormat":   return ev.format === "WEBINAR" ? "Webinar" : "Präsenz";
      case "dayOption":     return dayOptionLabel(p.dayOption);
      case "status":        return statusLabel(p.status);
      case "lastName":      return dec.lastName ?? "";
      case "firstName":     return dec.firstName ?? "";
      case "email":         return dec.email ?? "";
      case "phone":         return dec.phone ?? "";
      case "company":       return dec.company ?? "";
      case "street":        return dec.street ?? "";
      case "zip":           return dec.zip ?? "";
      case "city":          return dec.city ?? "";
      case "country":       return dec.country ?? "";
      case "notes":         return dec.notes ?? "";
      case "costCenter":    return dec.costCenter ?? "";
      case "billingCompany":return dec.billingCompany ?? "";
      case "billingName":   return dec.billingName ?? "";
      case "billingStreet": return dec.billingStreet ?? "";
      case "billingZipCity":return dec.billingZipCity ?? "";
      case "billingEmail":  return dec.billingEmail ?? "";
      case "basePrice":     return basePriceCents(ev.training, p.dayOption) / 100;
      case "discount":      return p.discountBps / 100;
      case "finalPrice":    return finalPriceCents(basePriceCents(ev.training, p.dayOption), p.discountBps) / 100;
      case "invoiceStatus": return invoiceStatusLabel(p.invoiceStatus);
      case "invoiceNumber": return p.invoiceNumber ?? "";
      case "invoiceIssuedAt": return fmtDate(p.invoiceIssuedAt);
      case "invoicePaidAt":   return fmtDate(p.invoicePaidAt);
      case "createdAt":     return fmtDateTime(p.createdAt);
      case "updatedAt":     return fmtDateTime(p.updatedAt);
    }
  }

  function fillSheet(ws: ExcelJS.Worksheet, rows: typeof parts) {
    ws.columns = defs.map((d) => ({ header: d.label, key: d.key, width: d.width }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = { vertical: "middle" };
    header.height = 22;
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });

    for (const p of rows) {
      const dec = decryptParticipant(p);
      const row: Record<string, string | number> = {};
      for (const d of defs) row[d.key] = valueFor(d.key, p, dec);
      ws.addRow(row);
    }

    for (const d of defs) {
      if (d.key === "basePrice" || d.key === "finalPrice") {
        const col = ws.getColumn(d.key);
        col.numFmt = '#,##0.00 "€"';
        col.alignment = { horizontal: "right" };
      } else if (d.key === "discount") {
        const col = ws.getColumn(d.key);
        col.numFmt = '0.00 "%"';
        col.alignment = { horizontal: "right" };
      }
    }

    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (defs.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: defs.length } };
    }
  }

  if (split) {
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
    if (wb.worksheets.length === 0) {
      fillSheet(wb.addWorksheet("Teilnehmer"), parts);
    }
  } else {
    fillSheet(wb.addWorksheet("Teilnehmer"), parts);
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  const fname = `teilnehmer_${stamp}.xlsx`;
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
