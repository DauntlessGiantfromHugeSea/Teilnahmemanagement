import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const m = await prisma.staff.findUnique({ where: { id } });
  if (m) await prisma.staff.update({ where: { id }, data: { active: !m.active } });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/staff-badges" },
  });
}
