// Setzt alle DRAFT-Zertifikate dieses Events auf RELEASED. Idempotent.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const now = new Date();
  const result = await prisma.certificate.updateMany({
    where: {
      status: "DRAFT",
      participant: { eventId: params.id },
    },
    data: { status: "RELEASED", releasedAt: now, issuedAt: now },
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
