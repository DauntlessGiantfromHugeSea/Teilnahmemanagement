// Setzt alle DRAFT-Zertifikate dieses Events auf RELEASED. Idempotent.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const now = new Date();
  // issuedAt NICHT ueberschreiben - das wurde beim Anlegen auf das
  // Schulungsdatum gesetzt und ist die Grundlage fuer die Gueltigkeit.
  const result = await prisma.certificate.updateMany({
    where: {
      status: "DRAFT",
      participant: { eventId: params.id },
    },
    data: { status: "RELEASED", releasedAt: now },
  });

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/events/${params.id}/certificates?ok=${encodeURIComponent(
        result.count === 0
          ? "Keine Entwürfe vorhanden."
          : `${result.count} Zertifikat${result.count === 1 ? "" : "e"} freigegeben.`
      )}`,
    },
  });
}
