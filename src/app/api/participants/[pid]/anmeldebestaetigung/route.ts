import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canViewEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { renderAnmeldebestaetigungPdf } from "@/lib/anmeldungPdf";
import { basePriceCents, finalPriceCents, formatEUR, formatPct } from "@/lib/pricing";

export const runtime = "nodejs";

function fmtDateLong(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

export async function GET(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const p = await prisma.participant.findUnique({
    where: { id: params.pid },
    include: { event: { include: { training: true } } },
  });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canViewEvent(s, p.eventId))) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const noBackground = url.searchParams.get("bg") === "0";
  const modeParam = url.searchParams.get("mode");
  const signatureMode: "auto" | "blank" | "digital" =
    modeParam === "blank" ? "blank" : modeParam === "digital" ? "digital" : "auto";

  // Signatur des ausstellenden Users laden
  const me = await prisma.user.findUnique({ where: { id: s.uid }, select: { signatureUrl: true } });

  const dec = decryptParticipant(p);
  const ev = p.event;

  const d1 = ev.day1Date ? fmtDateLong(ev.day1Date) : null;
  const d2 = ev.day2Date ? fmtDateLong(ev.day2Date) : null;
  const eventDateLine = d1 && d2 ? `${d1} und ${d2}` : (d1 ?? "Termin folgt");

  const dayLabel = p.dayOption === "DAY_1"
    ? d1 ? `nur Tag 1 (${d1})` : "nur Tag 1"
    : p.dayOption === "DAY_2"
    ? d2 ? `nur Tag 2 (${d2})` : "nur Tag 2"
    : d1 && d2 ? `Beide Tage (${d1} & ${d2})` : "Beide Tage";

  // Preis fuer die Anmeldebestaetigung berechnen (wie in der Buchhaltung)
  const base = basePriceCents(ev.training, p.dayOption);
  const final = finalPriceCents(base, p.discountBps);
  const priceLine = `${formatEUR(final)}${p.discountBps > 0 ? ` (Rabatt ${formatPct(p.discountBps)} auf ${formatEUR(base)})` : ""}`;

  const pdf = await renderAnmeldebestaetigungPdf({
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
    company: dec.company,
    email: dec.email,
    phone: dec.phone,
    eventTitle: ev.title,
    trainingTitle: ev.training.title,
    day1Date: ev.day1Date,
    day2Date: ev.day2Date,
    startTime: ev.startTime,
    endTime: ev.endTime,
    location: ev.location,
    format: ev.format,
    meetingUrl: ev.meetingUrl,
    dayLabel,
    priceLine,
    status: p.status,
    invoiceStatus: p.invoiceStatus,
    invoiceNumber: p.invoiceNumber,
    bookedAt: p.createdAt,
    issuedBy: s.name,
    signatureUrl: me?.signatureUrl ?? null,
    signatureMode,
    noBackground,
  });

  const safeName = `${dec.lastName ?? ""}_${dec.firstName ?? ""}`.replace(/[^A-Za-z0-9_-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Anmeldebestaetigung_${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
