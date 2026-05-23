import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";

// Toggle zwischen Storniert und nicht-Storniert. Default-Ziel: CANCELLED.
// Mit form-feld 'mode=reactivate' wird der Status auf REGISTERED zurueck-
// gesetzt (Rueckgaengig-Funktion).
export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });

  const p = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const f = await req.formData().catch(() => null);
  const mode = String(f?.get("mode") ?? "cancel");
  const nextStatus = mode === "reactivate" ? "REGISTERED" : "CANCELLED";

  await prisma.participant.update({
    where: { id: p.id },
    data: { status: nextStatus },
  });

  await audit({
    actorId: s.uid,
    action: nextStatus === "CANCELLED" ? "CANCEL" : "REACTIVATE",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
    diff: { from: p.status, to: nextStatus },
  });

  const back = req.headers.get("referer") ?? `/events/${p.eventId}/participants/${p.id}`;
  return new NextResponse(null, { status: 303, headers: { Location: back } });
}
