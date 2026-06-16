// Oeffentlicher Endpoint: Teilnehmer reicht ueber das Schulungs-Portal
// (/portal/<id>) eine Frage ein. Keine Auth - Spam-Schutz nur ueber simple
// Laengen-Limits.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ev = await prisma.event.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const f = await req.formData();
  const text = String(f.get("text") ?? "").trim().slice(0, 2000);
  const nameRaw = String(f.get("name") ?? "").trim().slice(0, 120);

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/portal/${ev.id}?${new URLSearchParams(q).toString()}#fragen` },
  });

  if (text.length < 3) return back({ error: "Bitte eine kurze Frage eintippen." });

  try {
    await prisma.eventQuestion.create({
      data: { eventId: ev.id, text, name: nameRaw || null },
    });
  } catch {
    // Fallback fuer historische DBs, in denen die Spalte 'name' noch NOT NULL ist:
    // einfach einen leeren String einsetzen statt NULL.
    await prisma.eventQuestion.create({
      data: { eventId: ev.id, text, name: nameRaw },
    });
  }
  return back({ ok: "Danke! Deine Frage ist abgeschickt." });
}
