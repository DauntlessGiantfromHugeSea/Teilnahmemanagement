import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { encryptParticipantInput } from "@/lib/participants";
import { audit } from "@/lib/audit";
import { DayOption, ParticipantStatus } from "@prisma/client";

function pctToBps(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "0").replace(",", "."));
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.round(n * 100)));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const base = new URL(req.url).origin;
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const enc = encryptParticipantInput({
    firstName: String(f.get("firstName") ?? ""),
    lastName: String(f.get("lastName") ?? ""),
    email: String(f.get("email") ?? "").trim(),
    phone: String(f.get("phone") ?? "") || null,
    company: String(f.get("company") ?? "") || null,
    street: String(f.get("street") ?? "") || null,
    zip: String(f.get("zip") ?? "") || null,
    city: String(f.get("city") ?? "") || null,
    country: String(f.get("country") ?? "") || null,
    notes: String(f.get("notes") ?? "") || null,
  });
  const dayOption = String(f.get("dayOption") ?? "BOTH") as DayOption;
  const status = String(f.get("status") ?? "REGISTERED") as ParticipantStatus;
  const discountBps = pctToBps(f.get("discountPct"));

  const p = await prisma.participant.create({
    data: {
      eventId: params.id,
      firstName: enc.firstName!,
      lastName: enc.lastName!,
      email: enc.email!,
      emailHash: enc.emailHash!,
      phone: enc.phone ?? null,
      company: enc.company ?? null,
      street: enc.street ?? null,
      zip: enc.zip ?? null,
      city: enc.city ?? null,
      country: enc.country ?? null,
      notes: enc.notes ?? null,
      dayOption,
      discountBps,
      status,
    },
  });
  await audit({
    actorId: s.uid,
    action: "CREATE",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
  });
  return NextResponse.redirect(`${base}/events/${params.id}/participants/${p.id}`, { status: 303 });
}
