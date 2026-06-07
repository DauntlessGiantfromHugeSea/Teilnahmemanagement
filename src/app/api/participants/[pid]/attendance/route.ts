// Schnelles Setzen von Anwesenheit (ATTENDED / NO_SHOW) bzw. Reset auf
// REGISTERED durch Event-Manager und Admins direkt aus der Teilnehmerliste.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const ALLOWED = new Set(["ATTENDED", "NO_SHOW", "REGISTERED"]);

export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });

  const p = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) return new NextResponse("Forbidden", { status: 403 });
  if (p.status === "CANCELLED") {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${p.eventId}` },
    });
  }

  const f = await req.formData().catch(() => null);
  const next = String(f?.get("status") ?? "REGISTERED");
  if (!ALLOWED.has(next)) {
    return new NextResponse("Ungueltiger Status", { status: 400 });
  }

  await prisma.participant.update({ where: { id: p.id }, data: { status: next as any } });
  await audit({
    actorId: s.uid,
    action: "ATTENDANCE",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
    diff: { from: p.status, to: next },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: req.headers.get("referer") ?? `/events/${p.eventId}` },
  });
}
