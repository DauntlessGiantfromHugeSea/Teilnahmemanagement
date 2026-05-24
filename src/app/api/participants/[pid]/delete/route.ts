import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";

// Loescht einen stornierten Teilnehmer endgueltig.
// Nicht-stornierte Anmeldungen werden abgelehnt - erst stornieren, dann loeschen.
export async function POST(_req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });

  const p = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (p.status !== "CANCELLED") {
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: `/events/${p.eventId}/participants/${p.id}?error=${encodeURIComponent(
          "Nur stornierte Anmeldungen koennen geloescht werden."
        )}`,
      },
    });
  }

  const eventId = p.eventId;
  await prisma.participant.delete({ where: { id: p.id } });

  // Audit ueberlebt die Loeschung (participantId wird auf null gesetzt durch SetNull).
  await audit({
    actorId: s.uid,
    action: "PARTICIPANT_DELETE",
    entityType: "Participant",
    entityId: p.id,
    diff: { eventId, status: p.status, invoiceStatus: p.invoiceStatus },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${eventId}?ok=${encodeURIComponent("Anmeldung geloescht")}` },
  });
}
