import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { encryptParticipantInput, decryptParticipant } from "@/lib/participants";
import { audit } from "@/lib/audit";
import { DayOption, ParticipantStatus } from "@prisma/client";

function pctToBps(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "0").replace(",", "."));
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.round(n * 100)));
}

export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const existing = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!existing) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, existing.eventId))) return new NextResponse("Forbidden", { status: 403 });

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

  const before = decryptParticipant(existing);
  const fNew = await prisma.participant.update({
    where: { id: existing.id },
    data: {
      ...enc,
      dayOption,
      discountBps,
      status,
    } as any,
  });

  // Diff (auf Klartext-Basis für Lesbarkeit) - verschlüsselt persistieren
  const diff: Record<string, { from: any; to: any }> = {};
  const after = decryptParticipant(fNew);
  for (const k of ["firstName", "lastName", "email", "phone", "company", "street", "zip", "city", "country", "notes"] as const) {
    if ((before as any)[k] !== (after as any)[k]) diff[k] = { from: (before as any)[k], to: (after as any)[k] };
  }
  if (existing.dayOption !== dayOption) diff.dayOption = { from: existing.dayOption, to: dayOption };
  if (existing.discountBps !== discountBps) diff.discountBps = { from: existing.discountBps, to: discountBps };
  if (existing.status !== status) diff.status = { from: existing.status, to: status };

  await audit({
    actorId: s.uid,
    action: "UPDATE",
    entityType: "Participant",
    entityId: existing.id,
    participantId: existing.id,
    diff,
    encryptDiff: true,
  });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${existing.eventId}/participants/${existing.id}` } });
}
