import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });

  const cert = await prisma.certificate.findUnique({
    where: { id: params.id },
    include: { participant: true },
  });
  if (!cert) return new NextResponse("Not found", { status: 404 });
  if (cert.participant) {
    if (!(await canWriteEvent(s, cert.participant.eventId))) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else if (s.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const f = await req.formData().catch(() => null);
  const reason = f ? String(f.get("reason") ?? "").trim() : "";

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokeReason: reason || null },
  });
  const msg = encodeURIComponent(`${cert.number} widerrufen.`);
  // Wenn der Klick aus der globalen Uebersicht kam, dorthin zurueckkehren -
  // sonst zur Event-Zertifikatsseite (bzw. zur Uebersicht fuer importierte).
  const referer = req.headers.get("referer") ?? "";
  let loc: string;
  if (referer.includes("/admin/zertifikate")) {
    loc = `/admin/zertifikate?ok=${msg}`;
  } else if (cert.participant?.eventId) {
    loc = `/events/${cert.participant.eventId}/certificates?ok=${msg}`;
  } else {
    loc = `/admin/zertifikate?ok=${msg}`;
  }
  return new NextResponse(null, { status: 303, headers: { Location: loc } });
}
