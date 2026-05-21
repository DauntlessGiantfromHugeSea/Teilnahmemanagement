import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
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

function priceCents(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function formatOrDefault(v: FormDataEntryValue | null): EventFormat {
  return String(v) === "WEBINAR" ? "WEBINAR" : "PRESENCE";
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !canWriteGlobal(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();

  const title = String(f.get("title") ?? "").trim();
  if (!title) return new NextResponse("Titel fehlt", { status: 400 });

  const format = formatOrDefault(f.get("format"));
  const description = strOrNull(f.get("description"));
  const notesPlain = String(f.get("notes") ?? "").trim();
  const twoDay = format === "PRESENCE" && String(f.get("duration") ?? "") === "TWO";

  // Training inline mit den übergebenen Preisen anlegen
  const training = await prisma.training.create({
    data: {
      title,
      description,
      priceDay1: priceCents(f.get("priceDay1")),
      priceDay2: twoDay ? priceCents(f.get("priceDay2")) : 0,
      priceBoth: twoDay ? priceCents(f.get("priceBoth")) : 0,
    },
  });
  await audit({ actorId: s.uid, action: "CREATE", entityType: "Training", entityId: training.id });

  const ev = await prisma.event.create({
    data: {
      title,
      trainingId: training.id,
      format,
      description,
      day1Date: dateOrNull(f.get("day1Date")),
      day2Date: twoDay ? dateOrNull(f.get("day2Date")) : null,
      startTime: strOrNull(f.get("startTime")),
      endTime: strOrNull(f.get("endTime")),
      location: format === "WEBINAR" ? null : strOrNull(f.get("location")),
      meetingUrl: format === "PRESENCE" ? null : strOrNull(f.get("meetingUrl")),
      capacity: intOrNull(f.get("capacity")),
      subtitle: strOrNull(f.get("subtitle")),
      longDescription: strOrNull(f.get("longDescription")),
      agenda: strOrNull(f.get("agenda")),
      heroImageUrl: strOrNull(f.get("heroImageUrl")),
      logoUrl: strOrNull(f.get("logoUrl")),
      notes: notesPlain ? encryptField(notesPlain) : null,
      createdById: s.uid,
    },
  });
  await audit({ actorId: s.uid, action: "CREATE", entityType: "Event", entityId: ev.id });
  const next = String(f.get("next") ?? "detail");
  const location = next === "another" ? `/events/new?ok=1` : `/events/${ev.id}`;
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}
