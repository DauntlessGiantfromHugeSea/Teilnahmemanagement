import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const on = f.get("on") === "1";
  await prisma.event.update({ where: { id: params.id }, data: { offlineMode: on } });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/wissenstest?ok=${encodeURIComponent(on ? "Offline-Modus aktiv." : "Offline-Modus aus.")}` },
  });
}
