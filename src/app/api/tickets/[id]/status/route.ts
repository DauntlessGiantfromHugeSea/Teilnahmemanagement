import { NextResponse } from "next/server";
import { TicketPriority, TicketStatus } from "@prisma/client";
import { getSession } from "@/lib/session";
import { canUseTickets } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !canUseTickets(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const statusRaw = String(f.get("status") ?? "");
  const priorityRaw = String(f.get("priority") ?? "");
  const from = String(f.get("from") ?? "");

  const location = from === "list" ? "/posteingang" : `/posteingang/${params.id}`;
  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `${location}?${new URLSearchParams(q).toString()}` },
    });

  const data: { status?: TicketStatus; priority?: TicketPriority; closedAt?: Date | null } = {};
  if (statusRaw && statusRaw in TicketStatus) {
    const status = statusRaw as TicketStatus;
    data.status = status;
    data.closedAt = status === TicketStatus.CLOSED ? new Date() : null;
  }
  if (priorityRaw && priorityRaw in TicketPriority) {
    data.priority = priorityRaw as TicketPriority;
  }
  if (Object.keys(data).length === 0) return back({ error: "Nichts zu ändern." });

  const ticket = await prisma.ticket.update({ where: { id: params.id }, data });

  await audit({
    actorId: s.uid,
    action: "TICKET_STATUS",
    entityType: "Ticket",
    entityId: ticket.id,
    diff: { reference: ticket.reference, status: data.status, priority: data.priority },
  });

  return back({ ok: "Ticket aktualisiert." });
}
