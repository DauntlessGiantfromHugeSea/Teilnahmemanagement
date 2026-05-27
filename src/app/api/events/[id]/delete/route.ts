import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";

// Loescht eine Veranstaltung endgueltig.
// Bedingungen:
//  - Veranstaltung muss als abgesagt markiert sein (cancelled=true)
//  - Es duerfen keine Teilnehmer mehr verknuepft sein
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canWriteEvent(s, params.id))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { _count: { select: { participants: true } } },
  });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const back = (qs: string) =>
    new NextResponse(null, { status: 303, headers: { Location: `/events/${ev.id}?${qs}` } });

  if (!ev.cancelled) {
    return back(`error=${encodeURIComponent("Bitte zuerst absagen, dann loeschen.")}`);
  }
  if (ev._count.participants > 0) {
    return back(
      `error=${encodeURIComponent(
        `Veranstaltung hat noch ${ev._count.participants} Teilnehmer. Bitte zuerst alle Anmeldungen entfernen.`
      )}`
    );
  }

  await prisma.event.delete({ where: { id: ev.id } });
  await audit({
    actorId: s.uid,
    action: "EVENT_DELETE",
    entityType: "Event",
    entityId: ev.id,
    diff: { title: ev.title, externalId: ev.externalId },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events?ok=${encodeURIComponent("Veranstaltung geloescht")}` },
  });
}
