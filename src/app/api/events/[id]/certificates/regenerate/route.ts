// Rebuild der Daten-Snapshots aller Zertifikate eines Events. Ersetzt die
// gespeicherte data-JSON neu (mit aktuellem Schulungsdatum, aktuellen Texten,
// aktuellen Kompetenzfeld-Beschreibungen). Nummer, Slug, Status, day,
// kompetenzfeldId und participantId bleiben unveraendert.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { buildCertificateData } from "@/lib/certificates";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: { training: true },
  });
  if (!event) return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/certificates?error=Event%20nicht%20gefunden` },
  });

  const certs = await prisma.certificate.findMany({
    where: {
      participant: { eventId: params.id },
      status: { not: "REVOKED" },
    },
    include: { participant: true },
  });

  let updated = 0;
  let skipped = 0;
  for (const c of certs) {
    if (!c.participant) { skipped++; continue; }
    try {
      const dayIndex: 1 | 2 | undefined =
        c.day === 1 ? 1 : c.day === 2 ? 2 : undefined;
      const data = await buildCertificateData({
        participant: c.participant,
        event: { ...event, training: event.training },
        type: c.type,
        kompetenzfeldId: c.kompetenzfeldId ?? undefined,
        dayIndex,
      });
      // Schulungstag fuer DB-issuedAt
      const dayDate = dayIndex === 2 ? event.day2Date : event.day1Date;
      await prisma.certificate.update({
        where: { id: c.id },
        data: {
          data: JSON.stringify(data),
          issuedAt: dayDate ?? c.issuedAt ?? null,
        },
      });
      updated++;
    } catch {
      skipped++;
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/events/${params.id}/certificates?ok=${encodeURIComponent(
        `${updated} Zertifikat${updated === 1 ? "" : "e"} neu generiert${skipped > 0 ? `, ${skipped} übersprungen` : ""}.`
      )}`,
    },
  });
}
