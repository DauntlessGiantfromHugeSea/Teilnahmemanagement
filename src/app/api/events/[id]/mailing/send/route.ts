import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /\b(https?:\/\/[^\s<>"']+)/g;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tpl(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function bodyToHtml(plain: string): string {
  const safe = esc(plain).replace(URL_RE, (u) => `<a href="${u}" style="color:#0f766e;">${u}</a>`);
  return safe.split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 12px 0;">${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/mailing?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const f = await req.formData();
  const subject = String(f.get("subject") ?? "").trim();
  const body = String(f.get("body") ?? "").trim();
  const bccAdmin = f.get("bccAdmin") === "on";
  const mode = String(f.get("mode") ?? "send");
  if (!subject || !body) return back({ error: "Betreff und Nachricht sind Pflicht." });

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!event) return back({ error: "Veranstaltung nicht gefunden." });

  const eventDate = fmtDate(event.day1Date);
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const adminMail = process.env.MAIL_ADMIN || undefined;

  // Testmail: nur an die eigene Adresse, Platzhalter werden mit dem Login-Namen
  // ersetzt - damit du das Mail-Layout pruefen kannst bevor du es an alle schickst.
  if (mode === "test") {
    const [firstName, ...rest] = s.name.split(" ");
    const vars = {
      firstName: firstName ?? s.name,
      lastName: rest.join(" "),
      eventTitle: event.title,
      eventDate,
    };
    const subj = tpl(subject, vars);
    const bod = tpl(body, vars);
    const res = await sendMail({
      to: s.email,
      subject: `[TEST] ${subj}`,
      text: bod,
      html: htmlShell(appName, bodyToHtml(bod)),
    });
    if (!res.ok) return back({ error: `Testmail fehlgeschlagen: ${res.error ?? "?"}` });
    return back({ ok: `Testmail an ${s.email} versendet.` });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const p of event.participants) {
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) { failed++; continue; }

    const vars = {
      firstName: dec.firstName ?? "",
      lastName: dec.lastName ?? "",
      eventTitle: event.title,
      eventDate,
    };
    const personalizedSubject = tpl(subject, vars);
    const personalizedBody = tpl(body, vars);

    const res = await sendMail({
      to: email,
      subject: personalizedSubject,
      text: personalizedBody,
      html: htmlShell(appName, bodyToHtml(personalizedBody)),
      bcc: bccAdmin && adminMail ? adminMail : undefined,
    });
    if (res.ok) sent++;
    else {
      failed++;
      if (errors.length < 5) errors.push(`${dec.firstName} ${dec.lastName}: ${res.error ?? "Mailfehler"}`);
    }
  }

  const detail = errors.length > 0 ? ` Fehler: ${errors.join("; ")}` : "";
  return back({ ok: `${sent} Mails versendet${failed > 0 ? `, ${failed} fehlgeschlagen` : ""}.${detail}` });
}
