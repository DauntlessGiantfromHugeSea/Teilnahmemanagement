import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string; grantId: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  await prisma.eventAccess.delete({ where: { id: params.grantId } });
  await audit({ actorId: s.uid, action: "REVOKE", entityType: "EventAccess", entityId: params.grantId });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}/access` } });
}
