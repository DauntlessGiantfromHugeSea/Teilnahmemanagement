import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";

function dateOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  await prisma.event.update({
    where: { id: params.id },
    data: {
      title: String(f.get("title") ?? "").trim(),
      trainingId: String(f.get("trainingId") ?? ""),
      day1Date: dateOrNull(f.get("day1Date")),
      day2Date: dateOrNull(f.get("day2Date")),
      location: String(f.get("location") ?? "") || null,
    },
  });
  await audit({ actorId: s.uid, action: "UPDATE", entityType: "Event", entityId: params.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}` } });
}
