import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const name = String(f.get("name") ?? "").trim();
  const color = String(f.get("color") ?? "").trim() || null;
  const position = Number(f.get("position") ?? 0) || 0;
  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/tags?${new URLSearchParams(q).toString()}` },
  });
  if (!name) return back({ error: "Name ist Pflicht." });
  try {
    await prisma.tag.create({ data: { name, color, position } });
  } catch (e: any) {
    return back({ error: e?.message ?? "Anlegen fehlgeschlagen." });
  }
  return back({ ok: `Tag '${name}' angelegt.` });
}
