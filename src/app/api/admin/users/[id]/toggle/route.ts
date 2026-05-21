import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  const base = new URL(req.url).origin;
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  if (s.uid === params.id) {
    return NextResponse.redirect(`${base}/admin/users?error=${encodeURIComponent("Eigenes Konto nicht deaktivieren")}`, { status: 303 });
  }
  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u) return new NextResponse("Not found", { status: 404 });
  await prisma.user.update({ where: { id: u.id }, data: { active: !u.active } });
  await audit({ actorId: s.uid, action: u.active ? "DEACTIVATE" : "ACTIVATE", entityType: "User", entityId: u.id });
  return NextResponse.redirect(`${base}/admin/users?ok=1`, { status: 303 });
}
