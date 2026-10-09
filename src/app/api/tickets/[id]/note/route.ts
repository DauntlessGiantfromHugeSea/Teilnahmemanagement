import { NextResponse } from "next/server";
import { TicketMsgDirection } from "@prisma/client";
import { getSession } from "@/lib/session";
import { canUseTickets } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { addMessage } from "@/lib/tickets";

export const dynamic = "force-dynamic";

// Interne Notiz am Ticket - wird nie verschickt und ist nur im Tool sichtbar.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !canUseTickets(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const body = String(f.get("body") ?? "").trim();
  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/posteingang/${params.id}?${new URLSearchParams(q).toString()}` },
    });

  if (!body) return back({ error: "Die Notiz ist leer." });

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket) return new NextResponse("Not found", { status: 404 });

  await addMessage({
    ticketId: ticket.id,
    direction: TicketMsgDirection.NOTE,
    fromName: s.name,
    bodyText: body,
    authorId: s.uid,
  });

  return back({ ok: "Notiz gespeichert." });
}
