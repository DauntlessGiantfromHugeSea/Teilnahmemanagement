import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const name = String(f.get("name") ?? "").trim();
  const color = String(f.get("color") ?? "").trim() || null;
  const position = Number(f.get("position") ?? 0) || 0;
  if (!id || !name) {
    return new NextResponse(null, { status: 303, headers: { Location: "/admin/tags?error=Pflichtfelder%20fehlen" } });
  }
  await prisma.tag.update({ where: { id }, data: { name, color, position } });
  return new NextResponse(null, { status: 303, headers: { Location: "/admin/tags?ok=Gespeichert." } });
}
