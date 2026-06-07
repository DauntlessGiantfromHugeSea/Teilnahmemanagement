import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent, isAdmin } from "@/lib/rbac";
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
  } else if (!isAdmin(s)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const referer = req.headers.get("referer") ?? "";
  const back = (q: Record<string, string>) => {
    const eventId = cert.participant?.eventId;
    const qs = new URLSearchParams(q).toString();
    let loc: string;
    if (referer.includes("/admin/zertifikate")) loc = `/admin/zertifikate?${qs}`;
    else if (eventId) loc = `/events/${eventId}/certificates?${qs}`;
    else loc = `/admin/zertifikate?${qs}`;
    return new NextResponse(null, { status: 303, headers: { Location: loc } });
  };

  // Entwurf: jeder mit Schreibrecht. Widerrufen: nur Admin. Freigegeben: nie loeschen,
  // sondern erst widerrufen.
  if (cert.status === "RELEASED") {
    return back({ error: "Freigegebene Zertifikate erst widerrufen, dann löschen." });
  }
  if (cert.status === "REVOKED" && !isAdmin(s)) {
    return back({ error: "Widerrufene Zertifikate können nur Admins löschen." });
  }
  await prisma.certificate.delete({ where: { id: cert.id } });
  return back({ ok: "Zertifikat gelöscht." });
}
