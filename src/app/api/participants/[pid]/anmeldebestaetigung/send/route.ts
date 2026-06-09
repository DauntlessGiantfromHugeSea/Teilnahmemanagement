// Schickt die Anmeldebestaetigung als PDF-Anhang an die hinterlegte
// E-Mail-Adresse des Teilnehmers. Unterstuetzt:
//   - mode=auto/digital
//   - signatureDataUrl (vom Canvas-Pad)
//   - bg=0 ist nicht sinnvoll (wir wollen das Briefpapier in der Mail)

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { renderAnmeldebestaetigungPdf } from "@/lib/anmeldungPdf";
import { basePriceCents, finalPriceCents, formatEUR, formatPct } from "@/lib/pricing";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtDateLong(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });

  const p = await prisma.participant.findUnique({
    where: { id: params.pid },
    include: { event: { include: { training: true } } },
  });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>, fallbackPath?: string) => {
    const ref = req.headers.get("referer") ?? fallbackPath ?? `/events/${p.eventId}/participants/${p.id}`;
    const join = ref.includes("?") ? "&" : "?";
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `${ref}${join}${new URLSearchParams(q).toString()}` },
    });
  };

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const f = await req.formData();
  const modeParam = String(f.get("mode") ?? "auto");
  const signatureMode: "auto" | "digital" = modeParam === "digital" ? "digital" : "auto";
  const sigData = String(f.get("signatureDataUrl") ?? "");
  const signatureDataUrl = sigData.startsWith("data:image/") ? sigData : null;

  const dec = decryptParticipant(p);
  const email = (dec.email ?? "").trim();
  if (!email || !EMAIL_RE.test(email)) {
    return back({ error: `Teilnehmer hat keine gültige E-Mail-Adresse.` });
  }
  const me = await prisma.user.findUnique({ where: { id: s.uid }, select: { signatureUrl: true } });
  const ev = p.event;
  const d1 = ev.day1Date ? fmtDateLong(ev.day1Date) : null;
  const d2 = ev.day2Date ? fmtDateLong(ev.day2Date) : null;
  const eventDateLine = d1 && d2 ? `${d1} – ${d2}` : (d1 ?? "Termin folgt");

  const dayLabel = p.dayOption === "DAY_1"
    ? d1 ? `nur Tag 1 (${d1})` : "nur Tag 1"
    : p.dayOption === "DAY_2"
    ? d2 ? `nur Tag 2 (${d2})` : "nur Tag 2"
    : d1 && d2 ? `Beide Tage (${d1} & ${d2})` : "Beide Tage";

  const base = basePriceCents(ev.training, p.dayOption);
  const fin = finalPriceCents(base, p.discountBps);
  const priceLine = `${formatEUR(fin)}${p.discountBps > 0 ? ` (Rabatt ${formatPct(p.discountBps)} auf ${formatEUR(base)})` : ""}`;

  const pdf = await renderAnmeldebestaetigungPdf({
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
    company: dec.company,
    email: dec.email,
    phone: dec.phone,
    eventTitle: ev.title,
    trainingTitle: ev.training.title,
    day1Date: ev.day1Date,
    day2Date: ev.day2Date,
    startTime: ev.startTime,
    endTime: ev.endTime,
    location: ev.location,
    format: ev.format,
    meetingUrl: ev.meetingUrl,
    dayLabel,
    priceLine,
    status: p.status,
    invoiceStatus: p.invoiceStatus,
    invoiceNumber: p.invoiceNumber,
    bookedAt: p.createdAt,
    issuedBy: s.name,
    signatureUrl: me?.signatureUrl ?? null,
    signatureDataUrl,
    signatureMode,
  });

  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihre Anmeldebestätigung</h1>
<p style="margin:0 0 12px 0;">Hallo ${esc(dec.firstName ?? "")} ${esc(dec.lastName ?? "")},</p>
<p style="margin:0 0 12px 0;">
  anbei finden Sie Ihre Anmeldebestätigung für <strong>${esc(ev.title)}</strong>
  am ${esc(eventDateLine)} als PDF.
</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
  Bei Fragen melden Sie sich gerne unter
  <a href="mailto:info@fb-akademie.de" style="color:#0f766e;">info@fb-akademie.de</a>.
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
  const text = [
    `Hallo ${dec.firstName ?? ""} ${dec.lastName ?? ""},`,
    ``,
    `anbei Ihre Anmeldebestätigung zur Schulung "${ev.title}" (${eventDateLine}) als PDF.`,
    ``,
    `Bei Fragen: info@fb-akademie.de`,
    ``,
    `Beste Grüße aus Leipzig`,
    `das Team der Flüssigboden Akademie`,
  ].join("\n");

  const safeName = `${dec.lastName ?? ""}_${dec.firstName ?? ""}`.replace(/[^A-Za-z0-9_-]+/g, "_");
  const res = await sendMail({
    to: email,
    subject: `Anmeldebestätigung: ${ev.title}`,
    text,
    html: htmlShell(appName, inner),
    attachments: [{
      filename: `Anmeldebestaetigung_${safeName}.pdf`,
      content: Buffer.from(pdf),
      contentType: "application/pdf",
    }],
  });
  if (!res.ok) return back({ error: `Versand fehlgeschlagen: ${res.error ?? "?"}` });
  return back({ ok: `Anmeldebestätigung an ${email} versendet.` });
}
