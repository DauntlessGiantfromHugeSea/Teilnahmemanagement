import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canViewEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { renderAgendaA3 } from "@/lib/agendaPdf";
import { loadLogoBuffer } from "@/lib/badgePdf";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canViewEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      agendaItems: { orderBy: [{ day: "asc" }, { position: "asc" }] },
    },
  });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  // Bevorzugt das echte FBA-Logo (nicht das interne /logo-fba.png mit Hintergrund)
  const logoUrl = "https://fluessigbodenakademie.de/wp-content/uploads/2024/12/fba.png";
  const logo = await loadLogoBuffer(logoUrl);

  const pdf = await renderAgendaA3({
    eventTitle: ev.title,
    day1Date: ev.day1Date,
    day2Date: ev.day2Date,
    location: ev.location,
    startTime: ev.startTime,
    endTime: ev.endTime,
    logoBuffer: logo,
    items: ev.agendaItems.map((i) => ({
      startTime: i.startTime,
      endTime: i.endTime,
      durationMin: i.durationMin,
      title: i.title,
      speaker: i.speaker,
      description: i.description,
      day: i.day,
    })),
  });

  const safe = ev.title.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Agenda_A3_${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
