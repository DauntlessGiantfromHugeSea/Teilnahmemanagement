import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string; grantId: string } }) {
  const base = new URL(req.url).origin;
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const g = await prisma.eventAccess.findUnique({ where: { id: params.grantId } });
  if (!g) return new NextResponse("not found", { status: 404 });
  await prisma.eventAccess.update({ where: { id: g.id }, data: { canWrite: !g.canWrite } });
  await audit({ actorId: s.uid, action: "UPDATE", entityType: "EventAccess", entityId: g.id });
  return NextResponse.redirect(`${base}/events/${params.id}/access`, { status: 303 });
}
