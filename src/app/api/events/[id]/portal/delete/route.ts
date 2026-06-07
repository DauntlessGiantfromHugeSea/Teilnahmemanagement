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
  const block = await prisma.eventPortalBlock.findUnique({ where: { id } });
  if (block && block.eventId === params.id) {
    await prisma.eventPortalBlock.delete({ where: { id } });
  }
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/portal?ok=Gel%C3%B6scht.` },
  });
}
