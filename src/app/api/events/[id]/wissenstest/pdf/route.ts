// Bulk- oder Einzel-Export der Wissenstest-PDFs. Bei Angabe von ?pid=...
// wird genau ein Teilnehmer exportiert, sonst alle aktiven.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { ensureResult, getActiveQuestions } from "@/lib/wissenstest";
import { renderWissenstestPdf, mergeWissenstestPdfs } from "@/lib/wissenstestPdf";

export const maxDuration = 300;
export const runtime = "nodejs";

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const onePid = url.searchParams.get("pid");

  const ev = await prisma.event.findUnique({ where: { id: params.id } });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const questions = await getActiveQuestions();
  if (questions.length === 0) return new NextResponse("Keine aktiven Wissenstest-Fragen angelegt.", { status: 400 });

  const where: any = { eventId: params.id };
  if (onePid) where.id = onePid;
  else where.status = { not: "CANCELLED" };

  const participants = await prisma.participant.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  if (participants.length === 0) return new NextResponse("Keine Teilnehmer.", { status: 400 });

  const dateLabel = ev.day2Date
    ? `${fmtDate(ev.day1Date)} – ${fmtDate(ev.day2Date)}`
    : fmtDate(ev.day1Date);

  const parts: Uint8Array[] = [];
  for (const p of participants) {
    const dec = decryptParticipant(p);
    const { code } = await ensureResult(p.id);
    const pdf = await renderWissenstestPdf({
      eventTitle: ev.title,
      externalId: ev.externalId,
      eventDate: dateLabel,
      participantName: `${dec.firstName ?? ""} ${dec.lastName ?? ""}`.trim() || "—",
      participantCompany: dec.company ?? null,
      questions: questions.map((q) => ({ text: q.text, options: q.options })),
      code,
    });
    parts.push(pdf);
  }

  const final = parts.length === 1 ? parts[0] : await mergeWissenstestPdfs(parts);
  const fileBase = onePid ? `wissenstest_${onePid}` : `wissenstest_${ev.externalId ?? ev.id}`;
  return new NextResponse(new Uint8Array(final), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileBase}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
