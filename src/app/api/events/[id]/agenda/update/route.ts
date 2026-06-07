import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const TIME = /^\d{1,2}:\d{2}$/;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const id = String(f.get("id") ?? "");
  const startTime = String(f.get("startTime") ?? "").trim();
  const endTime = String(f.get("endTime") ?? "").trim();
  const title = String(f.get("title") ?? "").trim();
  const speaker = String(f.get("speaker") ?? "").trim();
  const description = String(f.get("description") ?? "").trim();
  const position = Number(f.get("position") ?? 0);

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/agenda?${new URLSearchParams(q).toString()}` },
  });

  const item = await prisma.eventAgendaItem.findUnique({ where: { id } });
  if (!item || item.eventId !== params.id) return back({ error: "Eintrag nicht gefunden." });
  if (!TIME.test(startTime)) return back({ error: "Startzeit muss HH:MM sein." });
  if (endTime && !TIME.test(endTime)) return back({ error: "Endzeit muss HH:MM sein." });
  if (!title) return back({ error: "Titel ist Pflicht." });

  await prisma.eventAgendaItem.update({
    where: { id },
    data: {
      startTime,
      endTime: endTime || null,
      title,
      speaker: speaker || null,
      description: description || null,
      position: Number.isFinite(position) ? position : item.position,
    },
  });
  return back({ ok: "Gespeichert." });
}
