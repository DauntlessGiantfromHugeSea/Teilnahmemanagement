import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });

  const cert = await prisma.certificate.findUnique({
    where: { id: params.id },
    include: { participant: true },
  });
  if (!cert) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, cert.participant.eventId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (cert.status === "REVOKED") {
    return redir(cert.participant.eventId, { error: "Widerrufenes Zertifikat kann nicht freigegeben werden." });
  }

  await prisma.certificate.update({
    where: { id: cert.id },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
      issuedAt: cert.issuedAt ?? new Date(),
    },
  });
  return redir(cert.participant.eventId, { ok: `${cert.number} freigegeben.` });
}

function redir(eventId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${eventId}/certificates?${qs}` },
  });
}
