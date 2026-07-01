import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const block = await prisma.eventPortalBlock.findUnique({ where: { id } });
  if (!block || block.eventId !== params.id) {
    return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}/portal?error=Nicht%20gefunden` } });
  }
  await prisma.eventPortalBlock.update({
    where: { id },
    data: {
      icon: String(f.get("icon") ?? "").trim() || null,
      title: String(f.get("title") ?? "").trim() || block.title,
      body: String(f.get("body") ?? ""),
      visible: String(f.get("visible") ?? "1") === "1",
    },
  });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/portal?ok=Gespeichert.` },
  });
}
