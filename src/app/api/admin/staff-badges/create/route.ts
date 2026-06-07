import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const firstName = String(f.get("firstName") ?? "").trim();
  const lastName = String(f.get("lastName") ?? "").trim();
  const company = String(f.get("company") ?? "").trim();
  const subtitle = String(f.get("subtitle") ?? "").trim() || null;

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/staff-badges?${new URLSearchParams(q).toString()}` },
  });

  if (!firstName || !lastName) return back({ error: "Vor- und Nachname sind Pflicht." });
  if (!company) return back({ error: "Firma ist Pflicht." });
  await prisma.staff.create({ data: { firstName, lastName, company, subtitle } });
  return back({ ok: `${firstName} ${lastName} angelegt.` });
}
