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
function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

export async function POST(
  req: Request,
  { params }: { params: { pid: string } }
) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const p = await prisma.participant.findUnique({
    where: { id: params.pid },
    include: { event: true },
  });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) {
    return new NextResponse("Forbidden (Quell-Event)", { status: 403 });
  }

  const f = await req.formData();
  const targetEventId = String(f.get("targetEventId") ?? "");
  const notify = f.get("notify") === "on";
  const reason = String(f.get("reason") ?? "").trim();
  if (!targetEventId) return new NextResponse("Ziel-Event fehlt", { status: 400 });
  if (targetEventId === p.eventId) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${p.eventId}/participants/${p.id}` },
    });
  }

  const target = await prisma.event.findUnique({ where: { id: targetEventId } });
  if (!target) return new NextResponse("Ziel-Event nicht gefunden", { status: 404 });
  if (!(await canWriteEvent(s, target.id))) {
    return new NextResponse("Forbidden (Ziel-Event)", { status: 403 });
  }

  const targetHasTwoDays = !!target.day2Date;
  let nextDayOption = p.dayOption;
  if (!targetHasTwoDays && (p.dayOption === "DAY_2" || p.dayOption === "BOTH")) {
    nextDayOption = "DAY_1";
  }

  await prisma.participant.update({
    where: { id: p.id },
    data: { eventId: target.id, dayOption: nextDayOption },
  });

  await audit({
    actorId: s.uid,
    action: "MOVE",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
    diff: {
      fromEventId: p.eventId,
      toEventId: target.id,
      fromEventTitle: p.event.title,
      toEventTitle: target.title,
      dayOption: { from: p.dayOption, to: nextDayOption },
      notified: notify,
      reason: reason || undefined,
    },
  });

  // Optionaler Mail-Versand
  if (notify && isMailingConfigured()) {
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (email && EMAIL_RE.test(email)) {
      const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
      const fromDate = fmtDate(p.event.day1Date);
      const toDate = fmtDate(target.day1Date);
      const toDate2 = target.day2Date ? ` – ${fmtDate(target.day2Date)}` : "";
      const dayLabel = nextDayOption === "DAY_1"
        ? "Buchung nur für Tag 1"
        : nextDayOption === "DAY_2"
        ? "Buchung nur für Tag 2"
        : target.day2Date
        ? "Buchung für beide Tage"
        : "Buchung";
      const reasonHtml = reason
        ? `<p style="margin:0 0 12px 0;padding:10px 14px;background:#fef3c7;border-left:3px solid #d97706;border-radius:6px;">${esc(reason).replace(/\n/g, "<br>")}</p>`
        : "";
      const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihre Anmeldung wurde umgebucht</h1>
<p style="margin:0 0 12px 0;">Hallo ${esc(dec.firstName ?? "")} ${esc(dec.lastName ?? "")},</p>
<p style="margin:0 0 12px 0;">
  Ihre Anmeldung wurde von <strong>${esc(p.event.title)}</strong> (${esc(fromDate)})
  auf <strong>${esc(target.title)}</strong> (${esc(toDate)}${esc(toDate2)}) umgebucht.
</p>
<div style="margin:0 0 12px 0;padding:10px 14px;background:#f0fdfa;border-left:3px solid #0f766e;border-radius:6px;font-size:13px;">
  <strong>${esc(dayLabel)}</strong>
</div>
${reasonHtml}
<p style="margin:0 0 12px 0;">
  Bei Fragen melden Sie sich gerne unter
  <a href="mailto:info@fb-akademie.de" style="color:#0f766e;">info@fb-akademie.de</a>.
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
      const text = [
        `Hallo ${dec.firstName ?? ""} ${dec.lastName ?? ""},`,
        ``,
        `Ihre Anmeldung wurde von "${p.event.title}" (${fromDate}) auf "${target.title}" (${toDate}${toDate2}) umgebucht.`,
        ``,
        dayLabel,
        ...(reason ? [``, reason] : []),
        ``,
        `Bei Fragen: info@fb-akademie.de`,
        ``,
        `Beste Grüße aus Leipzig`,
        `das Team der Flüssigboden Akademie`,
      ].join("\n");
      void sendMail({
        to: email,
        subject: `Umbuchung: ${target.title}`,
        text,
        html: htmlShell(appName, inner),
      }).then((r) => {
        if (!r.ok) console.warn(`[move] Mail an ${email} fehlgeschlagen:`, r.error);
      });
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${target.id}/participants/${p.id}` },
  });
}
