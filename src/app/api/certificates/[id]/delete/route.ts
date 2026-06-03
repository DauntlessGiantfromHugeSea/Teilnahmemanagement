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
  if (cert.status !== "DRAFT") {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${cert.participant.eventId}/certificates?error=${encodeURIComponent("Nur Entwürfe können gelöscht werden. Bitte widerrufen.")}` },
    });
  }
  await prisma.certificate.delete({ where: { id: cert.id } });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${cert.participant.eventId}/certificates?ok=${encodeURIComponent("Entwurf gelöscht.")}` },
  });
}
