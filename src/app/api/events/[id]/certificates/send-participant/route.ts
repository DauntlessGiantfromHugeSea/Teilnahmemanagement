// Versendet EINE Mail an einen Teilnehmer mit Link auf das Zertifikats-Portal
// (Login per OTP). Alle freigegebenen Zertifikate werden dort gelistet und
// koennen runtergeladen werden - kein Mail-Anhang.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { isMailingConfigured } from "@/lib/mailer";
import { sendPortalInvite } from "@/lib/sendPortalInvite";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const participantId = String(f.get("participantId") ?? "");

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/certificates?${new URLSearchParams(q).toString()}` },
  });

  if (!participantId) return back({ error: "Teilnehmer fehlt." });
  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      event: true,
      certificates: { where: { status: "RELEASED" } },
    },
  });
  if (!participant || participant.eventId !== params.id) {
    return back({ error: "Teilnehmer nicht gefunden." });
  }

  const dec = decryptParticipant(participant);
  const email = (dec.email ?? "").trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !EMAIL_RE.test(email)) {
    return back({ error: `Keine gültige E-Mail-Adresse für ${dec.firstName} ${dec.lastName}.` });
  }
  if (participant.certificates.length === 0) {
    return back({ error: `Keine freigegebenen Zertifikate für ${dec.firstName} ${dec.lastName}.` });
  }

  const res = await sendPortalInvite({
    email,
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
    eventTitle: participant.event.title,
    certCount: participant.certificates.length,
  });
  if (!res.ok) return back({ error: `Versand fehlgeschlagen: ${res.error ?? "unbekannt"}` });

  await prisma.certificate.updateMany({
    where: { id: { in: participant.certificates.map((c) => c.id) } },
    data: { sentAt: new Date(), sentTo: email },
  });

  return back({ ok: `Portal-Link an ${email} versendet (${participant.certificates.length} Zertifikat${participant.certificates.length === 1 ? "" : "e"}).` });
}
