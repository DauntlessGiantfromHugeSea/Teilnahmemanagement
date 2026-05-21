import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { encryptField } from "@/lib/crypto";
import { EventFormat } from "@prisma/client";

function dateOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function strOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function intOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatOrDefault(v: FormDataEntryValue | null): EventFormat {
  return String(v) === "WEBINAR" ? "WEBINAR" : "PRESENCE";
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const format = formatOrDefault(f.get("format"));
  const notesPlain = String(f.get("notes") ?? "").trim();

  await prisma.event.update({
    where: { id: params.id },
    data: {
      title: String(f.get("title") ?? "").trim(),
      trainingId: String(f.get("trainingId") ?? ""),
      format,
      description: strOrNull(f.get("description")),
      day1Date: dateOrNull(f.get("day1Date")),
      day2Date: format === "WEBINAR" ? null : dateOrNull(f.get("day2Date")),
      startTime: strOrNull(f.get("startTime")),
      endTime: strOrNull(f.get("endTime")),
      location: format === "WEBINAR" ? null : strOrNull(f.get("location")),
      meetingUrl: format === "PRESENCE" ? null : strOrNull(f.get("meetingUrl")),
      capacity: intOrNull(f.get("capacity")),
      notes: notesPlain ? encryptField(notesPlain) : null,
    },
  });
  await audit({ actorId: s.uid, action: "UPDATE", entityType: "Event", entityId: params.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}` } });
}
