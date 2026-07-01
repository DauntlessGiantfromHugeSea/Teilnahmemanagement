// Bulk: pro Teilnehmer EINE Mail mit Portal-Link.
//
// Wir sammeln alle Teilnehmer mit mindestens einem RELEASED + noch nicht
// versendeten Zertifikat und schicken jedem genau eine Mail (statt N Mails
// pro Cert) - das vermeidet auch SMTP-"Invalid to"-Fehler bei einzelnen
// Adressen, weil wir die Adresse erst validieren.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { sendPortalInvite } from "@/lib/sendPortalInvite";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/certificates?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  // Alle Teilnehmer dieses Events mit RELEASED+nicht versendeten Certs
  const participants = await prisma.participant.findMany({
    where: {
      eventId: params.id,
      certificates: { some: { status: "RELEASED", sentAt: null } },
    },
    include: {
      event: true,
      certificates: { where: { status: "RELEASED", sentAt: null } },
    },
  });
  if (participants.length === 0) return back({ ok: "Nichts zu versenden." });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let sent = 0;
  let failed = 0;
  const invalid: string[] = [];

  for (const p of participants) {
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) {
      failed++;
      invalid.push(`${dec.firstName ?? ""} ${dec.lastName ?? ""}`.trim());
      continue;
    }
    try {
      const res = await sendPortalInvite({
        email,
        firstName: dec.firstName ?? "",
        lastName: dec.lastName ?? "",
        eventTitle: p.event.title,
        certCount: p.certificates.length,
      });
      if (res.ok) {
        await prisma.certificate.updateMany({
          where: { id: { in: p.certificates.map((c) => c.id) } },
          data: { sentAt: new Date(), sentTo: email },
        });
        sent++;
      } else {
        failed++;
        invalid.push(`${dec.firstName} ${dec.lastName} (${res.error ?? "Mailfehler"})`);
      }
    } catch (e: any) {
      failed++;
      console.error(`[send-batch] Fehler bei ${p.id}:`, e);
    }
  }

  const detail = invalid.length > 0
    ? ` Fehler bei: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? " …" : ""}`
    : "";
  return back({ ok: `${sent} Mails versendet, ${failed} fehlgeschlagen.${detail}` });
}
