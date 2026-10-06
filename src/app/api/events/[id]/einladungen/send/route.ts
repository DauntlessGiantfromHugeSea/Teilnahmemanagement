// Verschickt Einladungen zu einer Veranstaltung an selbst eingetragene
// Adressen. Jede Person bekommt eine eigene Mail - keine Sammeladresse, die
// Empfaenger sehen sich also nicht gegenseitig.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { parseRecipients } from "@/lib/recipientList";
import { buildInviteMail, eventDateLine, defaultInviteUrl } from "@/lib/invitations";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Obergrenze als Schutz vor einem versehentlich eingefuegten Grossbestand.
const MAX_RECIPIENTS = 500;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${params.id}/einladungen?${new URLSearchParams(q).toString()}` },
    });

  if (!isMailingConfigured()) return back({ error: "SMTP ist nicht konfiguriert." });

  const f = await req.formData();
  const subject = String(f.get("subject") ?? "").trim();
  const body = String(f.get("body") ?? "").trim();
  const rawList = String(f.get("recipients") ?? "");
  const bccAdmin = f.get("bccAdmin") === "on";
  const mode = String(f.get("mode") ?? "send");
  const link = String(f.get("link") ?? "").trim() || defaultInviteUrl(params.id);

  if (!subject || !body) return back({ error: "Betreff und Nachricht sind Pflicht." });
  if (!/^https?:\/\/\S+$/.test(link)) {
    return back({ error: "Der Anmelde-Link muss mit http:// oder https:// beginnen." });
  }

  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) return back({ error: "Veranstaltung nicht gefunden." });

  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const adminMail = process.env.MAIL_ADMIN || undefined;
  const eventDate = eventDateLine(event);

  // Testmail: nur an die eigene Adresse, mit dem eigenen Namen in der Anrede.
  if (mode === "test") {
    const [firstName, ...rest] = s.name.split(" ");
    const mail = buildInviteMail({
      subject,
      body,
      appName,
      vars: {
        firstName: firstName ?? s.name,
        lastName: rest.join(" "),
        eventTitle: event.title,
        eventDate,
        link,
      },
    });
    const res = await sendMail({
      to: s.email,
      subject: `[TEST] ${mail.subject}`,
      text: mail.text,
      html: mail.html,
    });
    if (!res.ok) return back({ error: `Testmail fehlgeschlagen: ${res.error ?? "unbekannter Fehler"}` });
    return back({ ok: `Testmail an ${s.email} verschickt.` });
  }

  const { recipients, invalid, duplicates } = parseRecipients(rawList);
  if (recipients.length === 0) {
    return back({ error: "Keine gültige E-Mail-Adresse in der Empfängerliste gefunden." });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return back({
      error: `${recipients.length} Adressen übersteigen das Limit von ${MAX_RECIPIENTS} pro Versand. Bitte in mehreren Durchgängen verschicken.`,
    });
  }

  let sent = 0;
  const failed: string[] = [];
  for (const r of recipients) {
    const mail = buildInviteMail({
      subject,
      body,
      appName,
      vars: {
        firstName: r.firstName,
        lastName: r.lastName,
        eventTitle: event.title,
        eventDate,
        link,
      },
    });
    const res = await sendMail({
      to: r.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      bcc: bccAdmin && adminMail ? adminMail : undefined,
    });
    if (res.ok) sent++;
    else failed.push(`${r.email}: ${res.error ?? "Mailfehler"}`);
  }

  // Nachweis, wer wann wie viele Einladungen ausgeloest hat. Die Adressen
  // selbst werden bewusst nicht gespeichert.
  await audit({
    actorId: s.uid,
    action: "INVITE_SENT",
    entityType: "Event",
    entityId: event.id,
    diff: { recipients: recipients.length, sent, failed: failed.length, link },
  });

  const notes: string[] = [];
  if (failed.length > 0) notes.push(`${failed.length} fehlgeschlagen`);
  if (invalid.length > 0) notes.push(`${invalid.length} Zeile(n) ohne Adresse übersprungen`);
  if (duplicates.length > 0) notes.push(`${duplicates.length} doppelte Adresse(n) nur einmal angeschrieben`);

  const detail = failed.length > 0 ? ` — ${failed.slice(0, 5).join("; ")}` : "";
  return back({
    ok: `${sent} Einladung${sent === 1 ? "" : "en"} verschickt${notes.length ? ` (${notes.join(", ")})` : ""}.${detail}`,
  });
}
