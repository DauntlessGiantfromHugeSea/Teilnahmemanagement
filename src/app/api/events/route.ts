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

  // Schulung: bestehende waehlen oder inline neu anlegen
  let trainingId = String(f.get("trainingId") ?? "");
  const trainingMode = String(f.get("trainingMode") ?? "");
  if (trainingMode === "new") {
    const newTitle = String(f.get("newTrainingTitle") ?? "").trim();
    if (!newTitle) return new NextResponse("Schulungstitel fehlt", { status: 400 });
    const t = await prisma.training.create({
      data: {
        title: newTitle,
        description: strOrNull(f.get("newTrainingDescription")),
        priceDay1: priceCents(f.get("newTrainingPriceDay1")),
        priceDay2: priceCents(f.get("newTrainingPriceDay2")),
        priceBoth: priceCents(f.get("newTrainingPriceBoth")),
      },
    });
    trainingId = t.id;
    await audit({ actorId: s.uid, action: "CREATE", entityType: "Training", entityId: t.id });
  }
  if (!trainingId) return new NextResponse("trainingId fehlt", { status: 400 });

  const format = formatOrDefault(f.get("format"));
  const notesPlain = String(f.get("notes") ?? "").trim();

  const ev = await prisma.event.create({
    data: {
      title: String(f.get("title") ?? "").trim(),
      trainingId,
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
      createdById: s.uid,
    },
  });
  await audit({ actorId: s.uid, action: "CREATE", entityType: "Event", entityId: ev.id });
  const next = String(f.get("next") ?? "detail");
  const location = next === "another" ? `/events/new?ok=1` : `/events/${ev.id}`;
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}
