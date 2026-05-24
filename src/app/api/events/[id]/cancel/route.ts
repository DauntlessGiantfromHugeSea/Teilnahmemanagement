import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";

// Toggle "Veranstaltung abgesagt". Form-Feld mode=reactivate setzt zurueck.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canWriteEvent(s, params.id))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const ev = await prisma.event.findUnique({ where: { id: params.id } });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const f = await req.formData().catch(() => null);
  const mode = String(f?.get("mode") ?? "cancel");
  const cancelled = mode !== "reactivate";

  await prisma.event.update({
    where: { id: ev.id },
    data: { cancelled },
  });
  await audit({
    actorId: s.uid,
    action: cancelled ? "EVENT_CANCEL" : "EVENT_REACTIVATE",
    entityType: "Event",
    entityId: ev.id,
    diff: { title: ev.title, from: ev.cancelled, to: cancelled },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${ev.id}` },
  });
}
