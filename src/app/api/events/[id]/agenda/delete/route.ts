import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const item = await prisma.eventAgendaItem.findUnique({ where: { id } });
  if (item && item.eventId === params.id) {
    await prisma.eventAgendaItem.delete({ where: { id } });
  }
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/agenda?ok=${encodeURIComponent("Eintrag gelöscht.")}` },
  });
}
