import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recomputeDay } from "@/lib/agenda";

const TIME = /^\d{1,2}:\d{2}$/;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const day = Math.max(1, Math.min(2, Number(f.get("day") ?? 1)));
  const startTime = String(f.get("startTime") ?? "").trim();
  const title = String(f.get("title") ?? "").trim();
  const speaker = String(f.get("speaker") ?? "").trim();
  const description = String(f.get("description") ?? "").trim();
  const durationMin = Math.max(0, Number(f.get("durationMin") ?? 30));

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/agenda?${new URLSearchParams(q).toString()}` },
  });

  if (!title) return back({ error: "Titel ist Pflicht." });

  // Naechste Position bestimmen
  const last = await prisma.eventAgendaItem.findFirst({
    where: { eventId: params.id, day },
    orderBy: { position: "desc" },
  });
  const position = (last?.position ?? 0) + 10;

  // Anker: wenn dies der erste Eintrag des Tages ist, muss eine Startzeit
  // gesetzt sein (vom User). Sonst wird sie vom recompute ueberschrieben.
  let effectiveStart = startTime;
  if (!last) {
    if (!TIME.test(startTime)) return back({ error: "Bitte Startzeit (HH:MM) für den ersten Eintrag des Tages eingeben." });
  } else {
    effectiveStart = last.endTime ?? last.startTime;
  }

  await prisma.eventAgendaItem.create({
    data: {
      eventId: params.id,
      day,
      startTime: effectiveStart,
      durationMin: Number.isFinite(durationMin) ? durationMin : 30,
      title,
      speaker: speaker || null,
      description: description || null,
      position,
    },
  });
  await recomputeDay(params.id, day);
  return back({ ok: "Eintrag angelegt." });
}
