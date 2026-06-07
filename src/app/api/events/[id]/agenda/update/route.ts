import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recomputeDay } from "@/lib/agenda";

const TIME = /^\d{1,2}:\d{2}$/;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const startTime = String(f.get("startTime") ?? "").trim();
  const title = String(f.get("title") ?? "").trim();
  const speaker = String(f.get("speaker") ?? "").trim();
  const description = String(f.get("description") ?? "").trim();
  const durationMin = Math.max(0, Number(f.get("durationMin") ?? 0));

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/agenda?${new URLSearchParams(q).toString()}` },
  });

  const item = await prisma.eventAgendaItem.findUnique({ where: { id } });
  if (!item || item.eventId !== params.id) return back({ error: "Eintrag nicht gefunden." });
  if (!title) return back({ error: "Titel ist Pflicht." });

  // Nur der erste Eintrag (kleinste Position pro Tag) traegt die Anker-Zeit.
  // Wir akzeptieren startTime nur dann; alle anderen werden vom recompute ueberschrieben.
  const data: any = {
    title,
    speaker: speaker || null,
    description: description || null,
    durationMin: Number.isFinite(durationMin) ? durationMin : item.durationMin,
  };
  const first = await prisma.eventAgendaItem.findFirst({
    where: { eventId: params.id, day: item.day },
    orderBy: { position: "asc" },
  });
  if (first?.id === item.id && startTime) {
    if (!TIME.test(startTime)) return back({ error: "Startzeit muss HH:MM sein." });
    data.startTime = startTime;
  }

  await prisma.eventAgendaItem.update({ where: { id }, data });
  await recomputeDay(params.id, item.day);
  return back({ ok: "Gespeichert." });
}
