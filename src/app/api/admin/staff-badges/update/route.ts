import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const firstName = String(f.get("firstName") ?? "").trim();
  const lastName = String(f.get("lastName") ?? "").trim();
  const company = String(f.get("company") ?? "").trim();
  const subtitle = String(f.get("subtitle") ?? "").trim() || null;
  if (!id || !firstName || !lastName || !company) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/admin/staff-badges?error=Pflichtfelder%20fehlen" },
    });
  }
  await prisma.staff.update({ where: { id }, data: { firstName, lastName, company, subtitle } });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/staff-badges?ok=Gespeichert." },
  });
}
