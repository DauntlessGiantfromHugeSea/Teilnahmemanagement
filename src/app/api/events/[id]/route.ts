import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { encryptField } from "@/lib/crypto";
import { saveUpload } from "@/lib/uploads";
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

function priceCents(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function formatOrDefault(v: FormDataEntryValue | null): EventFormat {
  return String(v) === "WEBINAR" ? "WEBINAR" : "PRESENCE";
}

function cleanExtraDays(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return null;
    const ok = arr
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
    return ok.length ? JSON.stringify(ok) : null;
  } catch {
    return null;
  }
}

async function resolveUpload(
  f: FormData,
  fileField: string,
  existingUrl: string | null
): Promise<string | null> {
  const file = f.get(fileField);
  if (file instanceof File && file.size > 0) {
    const saved = await saveUpload(file);
    if (saved) return saved.url;
  }
  return existingUrl;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const format = formatOrDefault(f.get("format"));
  const title = String(f.get("title") ?? "").trim();
  const description = strOrNull(f.get("description"));
  const notesPlain = String(f.get("notes") ?? "").trim();
  const twoDay = format === "PRESENCE" && String(f.get("duration") ?? "") === "TWO";

  const existing = await prisma.event.findUnique({ where: { id: params.id } });
  if (!existing) return new NextResponse("Not found", { status: 404 });

  // Training mit den übergebenen Preisen aktualisieren (gleiches trainingId behalten)
  await prisma.training.update({
    where: { id: existing.trainingId },
    data: {
      title,
      description,
      priceDay1: priceCents(f.get("priceDay1")),
      priceDay2: twoDay ? priceCents(f.get("priceDay2")) : 0,
      priceBoth: twoDay ? priceCents(f.get("priceBoth")) : 0,
    },
  });

  await prisma.event.update({
    where: { id: params.id },
    data: {
      title,
      format,
      description,
      day1Date: dateOrNull(f.get("day1Date")),
      day2Date: dateOrNull(f.get("day2Date")),
      extraDays: cleanExtraDays(f.get("extraDays")),
      startTime: strOrNull(f.get("startTime")),
      endTime: strOrNull(f.get("endTime")),
      location: format === "WEBINAR" ? null : strOrNull(f.get("location")),
      meetingUrl: format === "PRESENCE" ? null : strOrNull(f.get("meetingUrl")),
      capacity: intOrNull(f.get("capacity")),
      subtitle: strOrNull(f.get("subtitle")),
      longDescription: strOrNull(f.get("longDescription")),
      agenda: strOrNull(f.get("agenda")),
      heroImageUrl: await resolveUpload(f, "heroImageFile", strOrNull(f.get("heroImageUrl"))),
      logoUrl: await resolveUpload(f, "logoFile", strOrNull(f.get("logoUrl"))),
      certTnBody: strOrNull(f.get("certTnBody")),
      certTnBodyDay2: strOrNull(f.get("certTnBodyDay2")),
      notes: notesPlain ? encryptField(notesPlain) : null,
    },
  });
  await audit({ actorId: s.uid, action: "UPDATE", entityType: "Event", entityId: params.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}` } });
}
