import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
import { audit } from "@/lib/audit";

function dateOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !canWriteGlobal(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const trainingId = String(f.get("trainingId") ?? "");
  if (!trainingId) return new NextResponse("trainingId fehlt", { status: 400 });
  const ev = await prisma.event.create({
    data: {
      title: String(f.get("title") ?? "").trim(),
      trainingId,
      day1Date: dateOrNull(f.get("day1Date")),
      day2Date: dateOrNull(f.get("day2Date")),
      location: String(f.get("location") ?? "") || null,
      createdById: s.uid,
    },
  });
  await audit({ actorId: s.uid, action: "CREATE", entityType: "Event", entityId: ev.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${ev.id}` } });
}
