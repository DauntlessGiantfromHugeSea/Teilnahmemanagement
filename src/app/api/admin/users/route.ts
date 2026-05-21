import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
  const s = await getSession();
  const base = new URL(req.url).origin;
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const name = String(f.get("name") ?? "").trim();
  const password = String(f.get("password") ?? "");
  const role = String(f.get("role") ?? "VIEWER") as Role;
  if (password.length < 10) {
    return NextResponse.redirect(`${base}/admin/users?error=${encodeURIComponent("Passwort zu kurz")}`, { status: 303 });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.redirect(`${base}/admin/users?error=${encodeURIComponent("E-Mail existiert bereits")}`, { status: 303 });
  }
  const u = await prisma.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
  });
  await audit({ actorId: s.uid, action: "CREATE", entityType: "User", entityId: u.id });
  return NextResponse.redirect(`${base}/admin/users?ok=1`, { status: 303 });
}
