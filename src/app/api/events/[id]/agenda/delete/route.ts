import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recomputeDay } from "@/lib/agenda";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const item = await prisma.eventAgendaItem.findUnique({ where: { id } });
  if (item && item.eventId === params.id) {
    await prisma.eventAgendaItem.delete({ where: { id } });
    await recomputeDay(params.id, item.day);
  }
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/agenda?ok=${encodeURIComponent("Eintrag gelöscht.")}` },
  });
}
