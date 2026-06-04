import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { decryptParticipant } from "@/lib/participants";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Toggle zwischen Storniert und nicht-Storniert. Default-Ziel: CANCELLED.
// Mit form-feld 'mode=reactivate' wird der Status auf REGISTERED zurueck-
// gesetzt. Optional kann beim Stornieren eine Mail an den Teilnehmer gehen.
export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });

  const p = await prisma.participant.findUnique({
    where: { id: params.pid },
    include: { event: true },
  });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const f = await req.formData().catch(() => null);
  const mode = String(f?.get("mode") ?? "cancel");
  const nextStatus = mode === "reactivate" ? "REGISTERED" : "CANCELLED";
  const notify = f?.get("notify") === "on";
  const reason = String(f?.get("reason") ?? "").trim();

  await prisma.participant.update({
    where: { id: p.id },
    data: { status: nextStatus },
  });

  await audit({
    actorId: s.uid,
    action: nextStatus === "CANCELLED" ? "CANCEL" : "REACTIVATE",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
    diff: { from: p.status, to: nextStatus, notified: notify, reason: reason || undefined },
  });

  // Optionaler Mail-Versand bei Stornierung
  if (nextStatus === "CANCELLED" && notify && isMailingConfigured()) {
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (email && EMAIL_RE.test(email)) {
      const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
      const reasonHtml = reason
        ? `<p style="margin:0 0 12px 0;padding:10px 14px;background:#fef3c7;border-left:3px solid #d97706;border-radius:6px;">${esc(reason).replace(/\n/g, "<br>")}</p>`
        : "";
      const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihre Anmeldung wurde storniert</h1>
<p style="margin:0 0 12px 0;">Hallo ${esc(dec.firstName ?? "")} ${esc(dec.lastName ?? "")},</p>
<p style="margin:0 0 12px 0;">
  Ihre Anmeldung zur Schulung <strong>${esc(p.event.title)}</strong> wurde von uns storniert.
</p>
${reasonHtml}
<p style="margin:0 0 12px 0;">
  Falls Sie dazu Fragen haben, melden Sie sich gerne unter
  <a href="mailto:info@fb-akademie.de" style="color:#0f766e;">info@fb-akademie.de</a>.
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
      const text = [
        `Hallo ${dec.firstName ?? ""} ${dec.lastName ?? ""},`,
        ``,
        `Ihre Anmeldung zur Schulung "${p.event.title}" wurde storniert.`,
        ...(reason ? [``, reason] : []),
        ``,
        `Bei Fragen melden Sie sich gerne unter info@fb-akademie.de.`,
        ``,
        `Beste Grüße aus Leipzig`,
        `das Team der Flüssigboden Akademie`,
      ].join("\n");
      // Fire-and-forget - nicht blockierend, Fehler nur loggen
      void sendMail({
        to: email,
        subject: `Stornierung: ${p.event.title}`,
        text,
        html: htmlShell(appName, inner),
      }).then((r) => {
        if (!r.ok) console.warn(`[cancel] Mail an ${email} fehlgeschlagen:`, r.error);
      });
    }
  }

  const back = req.headers.get("referer") ?? `/events/${p.eventId}/participants/${p.id}`;
  return new NextResponse(null, { status: 303, headers: { Location: back } });
}
