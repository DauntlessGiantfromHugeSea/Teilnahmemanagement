import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { Role } from "@prisma/client";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  const base = new URL(req.url).origin;
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const role = String(f.get("role") ?? "VIEWER") as Role;
  const before = await prisma.user.findUnique({ where: { id: params.id } });
  if (!before) return new NextResponse("Not found", { status: 404 });
  await prisma.user.update({ where: { id: params.id }, data: { role } });
  await audit({ actorId: s.uid, action: "UPDATE", entityType: "User", entityId: params.id, diff: { role: { from: before.role, to: role } } });
  return NextResponse.redirect(`${base}/admin/users?ok=1`, { status: 303 });
}
