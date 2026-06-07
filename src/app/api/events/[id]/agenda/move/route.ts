import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recomputeDay } from "@/lib/agenda";

// Verschiebt einen Eintrag nach oben (dir=up) oder unten (dir=down) durch
// Tausch der Position-Werte mit dem unmittelbaren Nachbarn am gleichen Tag.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const dir = String(f.get("dir") ?? "up");
  const item = await prisma.eventAgendaItem.findUnique({ where: { id } });
  if (!item || item.eventId !== params.id) {
    return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}/agenda` } });
  }
  const neighbor = await prisma.eventAgendaItem.findFirst({
    where: {
      eventId: params.id,
      day: item.day,
      position: dir === "down" ? { gt: item.position } : { lt: item.position },
    },
    orderBy: { position: dir === "down" ? "asc" : "desc" },
  });
  if (neighbor) {
    await prisma.$transaction([
      prisma.eventAgendaItem.update({ where: { id: item.id }, data: { position: neighbor.position } }),
      prisma.eventAgendaItem.update({ where: { id: neighbor.id }, data: { position: item.position } }),
    ]);
    await recomputeDay(params.id, item.day);
  }
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}/agenda` } });
}
