import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: { pid: string } }
) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const p = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) {
    return new NextResponse("Forbidden (Quell-Event)", { status: 403 });
  }

  const f = await req.formData();
  const targetEventId = String(f.get("targetEventId") ?? "");
  if (!targetEventId) return new NextResponse("Ziel-Event fehlt", { status: 400 });
  if (targetEventId === p.eventId) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${p.eventId}/participants/${p.id}` },
    });
  }

  const target = await prisma.event.findUnique({ where: { id: targetEventId } });
  if (!target) return new NextResponse("Ziel-Event nicht gefunden", { status: 404 });
  if (!(await canWriteEvent(s, target.id))) {
    return new NextResponse("Forbidden (Ziel-Event)", { status: 403 });
  }

  // dayOption ggf. anpassen: wenn Ziel keinen Tag 2 hat, DAY_2/BOTH auf DAY_1 zurückfallen
  const targetHasTwoDays = !!target.day2Date;
  let nextDayOption = p.dayOption;
  if (!targetHasTwoDays && (p.dayOption === "DAY_2" || p.dayOption === "BOTH")) {
    nextDayOption = "DAY_1";
  }

  await prisma.participant.update({
    where: { id: p.id },
    data: { eventId: target.id, dayOption: nextDayOption },
  });

  await audit({
    actorId: s.uid,
    action: "MOVE",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
    diff: {
      fromEventId: p.eventId,
      toEventId: target.id,
      dayOption: { from: p.dayOption, to: nextDayOption },
    },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${target.id}/participants/${p.id}` },
  });
}
