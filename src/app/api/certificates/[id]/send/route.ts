// Einzelversand: schickt dem Teilnehmer eine Portal-Einladung. Das einzelne
// Zertifikat ist im Portal nach OTP-Login direkt verfuegbar.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { sendPortalInvite } from "@/lib/sendPortalInvite";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });

  const cert = await prisma.certificate.findUnique({
    where: { id: params.id },
    include: { participant: { include: { event: true } } },
  });
  if (!cert) return new NextResponse("Not found", { status: 404 });
  if (!cert.participant) {
    return new NextResponse("Importierte Zertifikate können nicht versendet werden.", { status: 400 });
  }
  if (!(await canWriteEvent(s, cert.participant.eventId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const eventId = cert.participant.eventId;
  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${eventId}/certificates?${new URLSearchParams(q).toString()}` },
  });

  if (cert.status !== "RELEASED") return back({ error: "Nur freigegebene Zertifikate können versendet werden." });

  const dec = decryptParticipant(cert.participant);
  const email = (dec.email ?? "").trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !EMAIL_RE.test(email)) {
    return back({ error: `Keine gültige E-Mail-Adresse: ${JSON.stringify(dec.email ?? "")}` });
  }

  const res = await sendPortalInvite({
    email,
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
    eventTitle: cert.participant.event.title,
    certCount: 1,
  });
  if (!res.ok) return back({ error: `Versand fehlgeschlagen: ${res.error ?? "unbekannt"}` });

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { sentAt: new Date(), sentTo: email },
  });
  return back({ ok: `Portal-Link an ${email} versendet.` });
}
