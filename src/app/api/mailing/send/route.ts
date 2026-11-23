import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canSendBroadcast, listAccessibleEventIds } from "@/lib/rbac";
import { isMailingConfigured } from "@/lib/mailer";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import {
  MAX_RECIPIENTS,
  MAX_RECIPIENTS_INDIVIDUAL,
  collectEventRecipients,
  parseAddressList,
  renderBroadcast,
  sendBroadcast,
  type BroadcastMode,
  type EventRecipient,
} from "@/lib/broadcast";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function back(q: Record<string, string>): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/mailing?${new URLSearchParams(q).toString()}` },
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !canSendBroadcast(s)) return new NextResponse("Forbidden", { status: 403 });
  if (!isMailingConfigured()) return back({ error: "Es ist kein Mailversand eingerichtet." });

  const f = await req.formData();
  const subject = String(f.get("subject") ?? "").trim();
  const body = String(f.get("body") ?? "").trim();
  const mode: BroadcastMode = String(f.get("sendMode") ?? "bcc") === "individual" ? "individual" : "bcc";
  const action = String(f.get("action") ?? "test");
  const ctaLabel = String(f.get("ctaLabel") ?? "").trim() || undefined;
  const ctaUrl = String(f.get("ctaUrl") ?? "").trim() || undefined;
  const footerNote = String(f.get("footerNote") ?? "").trim() || undefined;
  const copyToMe = f.get("copyToMe") === "on";

  if (!subject || !body) return back({ error: "Betreff und Nachricht sind Pflicht." });
  if (ctaLabel && !ctaUrl) return back({ error: "Für die Schaltfläche fehlt die Adresse." });
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    return back({ error: "Die Adresse der Schaltfläche muss mit http:// oder https:// beginnen." });
  }

  // --- Testmail: nur an die eigene Adresse ---------------------------------
  if (action === "test") {
    const [firstName, ...rest] = s.name.split(" ");
    const mail = await renderBroadcast(
      subject,
      body,
      {
        firstName: firstName ?? s.name,
        lastName: rest.join(" "),
        company: "",
        eventTitle: "Beispiel-Veranstaltung",
        eventDate: new Date().toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      },
      { ctaLabel, ctaUrl, footerNote }
    );
    const { sendMail } = await import("@/lib/mailer");
    const res = await sendMail({
      to: s.email,
      subject: `[TEST] ${mail.subject}`,
      text: mail.text,
      html: mail.html,
    });
    if (!res.ok) return back({ error: `Testmail fehlgeschlagen: ${res.error ?? "unbekannt"}` });
    return back({ ok: `Testmail an ${s.email} verschickt.` });
  }

  // --- Empfänger zusammenstellen -------------------------------------------
  const typed = parseAddressList(String(f.get("addresses") ?? ""));
  const eventIds = f.getAll("eventIds").map(String).filter(Boolean);

  const scope = await listAccessibleEventIds(s);
  const fromEvents = await collectEventRecipients(eventIds, scope);

  // Zusammenführen: frei eingetippte Adressen ohne Namen, Teilnehmer mit.
  const byMail = new Map<string, EventRecipient>();
  for (const r of fromEvents.recipients) byMail.set(r.email, r);
  for (const email of typed.valid) {
    if (byMail.has(email)) continue;
    byMail.set(email, {
      email,
      firstName: "",
      lastName: "",
      company: "",
      eventTitle: "",
      eventDate: "",
    });
  }
  const recipients = [...byMail.values()];

  if (recipients.length === 0) {
    return back({ error: "Keine gültigen Empfänger. Adressen eintragen oder Veranstaltung auswählen." });
  }
  const cap = mode === "individual" ? MAX_RECIPIENTS_INDIVIDUAL : MAX_RECIPIENTS;
  if (recipients.length > cap) {
    return back({
      error:
        `${recipients.length} Empfänger überschreiten die Grenze von ${cap} für diesen Versandweg.` +
        (mode === "individual" ? " Für größere Verteiler bitte den BCC-Versand verwenden." : ""),
    });
  }

  // --- Verschicken ---------------------------------------------------------
  const result = await sendBroadcast({
    subject,
    body,
    mode,
    recipients,
    ctaLabel,
    ctaUrl,
    footerNote,
    copyTo: copyToMe ? s.email : undefined,
  });

  // --- Für die Nachvollziehbarkeit festhalten ------------------------------
  // Bei Terminänderungen und Zugangslinks ist hinterher genau das die Frage:
  // wer hat wann was an wen geschickt.
  const record = await prisma.broadcast.create({
    data: {
      // Beide sind oben als nicht leer geprueft, encryptField liefert hier
      // also immer einen Wert (gleiche Schreibweise wie in src/lib/tickets.ts).
      subject: encryptField(subject)!,
      body: encryptField(body)!,
      mode,
      recipients: encryptField(JSON.stringify(recipients.map((r) => r.email))),
      recipientCount: recipients.length,
      sentCount: result.sent,
      failedCount: result.failed,
      eventIds: eventIds.length ? JSON.stringify(eventIds) : null,
      ctaLabel: ctaLabel ?? null,
      ctaUrl: ctaUrl ?? null,
      senderId: s.uid,
    },
  });
  await audit({
    actorId: s.uid,
    action: "BROADCAST_SEND",
    entityType: "Broadcast",
    entityId: record.id,
    diff: {
      mode,
      recipients: recipients.length,
      sent: result.sent,
      failed: result.failed,
      events: eventIds.length,
    },
  });

  const hints: string[] = [];
  if (typed.invalid.length) hints.push(`${typed.invalid.length} Adresse(n) unlesbar und übersprungen`);
  if (typed.duplicates) hints.push(`${typed.duplicates} Dublette(n) entfernt`);
  if (fromEvents.withoutEmail) hints.push(`${fromEvents.withoutEmail} Teilnehmer ohne Mailadresse`);
  if (result.errors.length) hints.push(result.errors.join("; "));

  if (result.failed > 0) {
    return back({
      error: `${result.sent} von ${recipients.length} verschickt, ${result.failed} fehlgeschlagen.` +
        (hints.length ? ` ${hints.join(" · ")}` : ""),
    });
  }
  return back({
    ok:
      `${result.sent} Empfänger erreicht (${result.messages} Nachricht${result.messages === 1 ? "" : "en"}).` +
      (hints.length ? ` ${hints.join(" · ")}` : ""),
  });
}
