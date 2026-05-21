import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  if (s.uid === params.id) {
    return new NextResponse(null, { status: 303, headers: { Location: `/admin/users?error=${encodeURIComponent("Eigenes Konto nicht deaktivieren")}` } });
  }
  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u) return new NextResponse("Not found", { status: 404 });
  await prisma.user.update({ where: { id: u.id }, data: { active: !u.active } });
  await audit({ actorId: s.uid, action: u.active ? "DEACTIVATE" : "ACTIVATE", entityType: "User", entityId: u.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/admin/users?ok=1` } });
}
