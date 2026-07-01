import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const icon = String(f.get("icon") ?? "").trim() || null;
  const title = String(f.get("title") ?? "").trim();
  const body = String(f.get("body") ?? "").trim();

  if (!title) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${params.id}/portal?error=${encodeURIComponent("Titel ist Pflicht.")}` },
    });
  }
  const last = await prisma.eventPortalBlock.findFirst({
    where: { eventId: params.id },
    orderBy: { position: "desc" },
  });
  await prisma.eventPortalBlock.create({
    data: {
      eventId: params.id,
      icon,
      title,
      body,
      position: (last?.position ?? 0) + 10,
    },
  });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/portal?ok=Block%20angelegt.` },
  });
}
