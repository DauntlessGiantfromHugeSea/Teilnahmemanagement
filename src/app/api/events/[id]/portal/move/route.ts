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
  const dir = String(f.get("dir") ?? "up");
  const item = await prisma.eventPortalBlock.findUnique({ where: { id } });
  if (item && item.eventId === params.id) {
    const neighbor = await prisma.eventPortalBlock.findFirst({
      where: {
        eventId: params.id,
        position: dir === "down" ? { gt: item.position } : { lt: item.position },
      },
      orderBy: { position: dir === "down" ? "asc" : "desc" },
    });
    if (neighbor) {
      await prisma.$transaction([
        prisma.eventPortalBlock.update({ where: { id: item.id }, data: { position: neighbor.position } }),
        prisma.eventPortalBlock.update({ where: { id: neighbor.id }, data: { position: item.position } }),
      ]);
    }
  }
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/portal` },
  });
}
