import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

function back(eventId: string, q: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${eventId}/wissenstest?${new URLSearchParams(q).toString()}` },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim().toUpperCase();
  const correctRaw = String(f.get("correctCount") ?? "").trim();
  const totalRaw = String(f.get("totalCount") ?? "").trim();
  const notes = String(f.get("notes") ?? "").trim() || null;

  if (!code) return back(params.id, { error: "Bitte Code eingeben." });
  const correctCount = correctRaw ? Number(correctRaw) : null;
  const totalCount = totalRaw ? Number(totalRaw) : null;

  const r = await prisma.wissenstestResult.findUnique({
    where: { code },
    include: { participant: true },
  });
  if (!r) return back(params.id, { error: `Code ${code} nicht gefunden.` });
  if (r.participant.eventId !== params.id) {
    return back(params.id, { error: `Code ${code} gehört nicht zu dieser Veranstaltung.` });
  }
  await prisma.wissenstestResult.update({
    where: { id: r.id },
    data: {
      correctCount: correctCount ?? null,
      totalCount: totalCount ?? null,
      notes,
      gradedAt: new Date(),
      gradedById: s.uid,
    },
  });
  return back(params.id, { ok: `Ergebnis für ${code} gespeichert.` });
}
