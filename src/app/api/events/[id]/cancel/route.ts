import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { decryptParticipant } from "@/lib/participants";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Toggle "Veranstaltung abgesagt". Form-Feld mode=reactivate setzt zurueck.
// Beim Absagen kann optional eine Mail an alle Teilnehmer geschickt werden.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canManageEvent(s, params.id))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const f = await req.formData().catch(() => null);
  const mode = String(f?.get("mode") ?? "cancel");
  const cancelled = mode !== "reactivate";
  const notify = f?.get("notify") === "on";
  const reason = String(f?.get("reason") ?? "").trim();

  await prisma.event.update({
    where: { id: ev.id },
    data: { cancelled },
  });
  await audit({
    actorId: s.uid,
    action: cancelled ? "EVENT_CANCEL" : "EVENT_REACTIVATE",
    entityType: "Event",
    entityId: ev.id,
    diff: { title: ev.title, from: ev.cancelled, to: cancelled, notified: notify, reason: reason || undefined },
  });

  let notified = 0;
  if (cancelled && notify && isMailingConfigured()) {
    const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
    const reasonHtml = reason
      ? `<p style="margin:0 0 12px 0;padding:10px 14px;background:#fef3c7;border-left:3px solid #d97706;border-radius:6px;">${esc(reason).replace(/\n/g, "<br>")}</p>`
      : "";
    for (const p of ev.participants) {
      if (p.status === "CANCELLED") continue;
      const dec = decryptParticipant(p);
      const email = (dec.email ?? "").trim();
      if (!email || !EMAIL_RE.test(email)) continue;
      const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Die Schulung wurde abgesagt</h1>
<p style="margin:0 0 12px 0;">Hallo ${esc(dec.firstName ?? "")} ${esc(dec.lastName ?? "")},</p>
<p style="margin:0 0 12px 0;">
  leider müssen wir die Veranstaltung <strong>${esc(ev.title)}</strong> absagen.
</p>
${reasonHtml}
<p style="margin:0 0 12px 0;">
  Sie müssen nichts weiter unternehmen — Ihre Anmeldung gilt als storniert. Bei Fragen
  erreichen Sie uns unter <a href="mailto:info@fb-akademie.de" style="color:#0f766e;">info@fb-akademie.de</a>.
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
      const text = [
        `Hallo ${dec.firstName ?? ""} ${dec.lastName ?? ""},`,
        ``,
        `leider müssen wir die Veranstaltung "${ev.title}" absagen.`,
        ...(reason ? [``, reason] : []),
        ``,
        `Bei Fragen melden Sie sich gerne unter info@fb-akademie.de.`,
        ``,
        `Beste Grüße aus Leipzig`,
        `das Team der Flüssigboden Akademie`,
      ].join("\n");
      void sendMail({
        to: email,
        subject: `Absage: ${ev.title}`,
        text,
        html: htmlShell(appName, inner),
      }).then((r) => {
        if (!r.ok) console.warn(`[event-cancel] Mail an ${email} fehlgeschlagen:`, r.error);
      });
      notified++;
    }
  }

  const query = notified > 0 ? `?ok=${encodeURIComponent(`${notified} Teilnehmer per Mail informiert.`)}` : "";
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${ev.id}${query}` },
  });
}
