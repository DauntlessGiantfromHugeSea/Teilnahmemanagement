// Smoke-Test fuer den Posteingang (Tickets + IMAP-Import-Logik).
//
// Legt in einer LEEREN Testdatenbank Beispieldaten an und prueft den
// kompletten Weg: eingehende Mail -> Ticket mit Referenz -> Zuordnung von
// Rueckantworten -> Kontaktprofil mit Schulungshistorie.
//
// NIEMALS gegen die Produktionsdatenbank laufen lassen - das Skript schreibt.
//
//   createdb tm_test
//   DATABASE_URL="postgresql://.../tm_test" npx prisma db push
//   DATABASE_URL="postgresql://.../tm_test" \
//   FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32) \
//     npx tsx scripts/test-tickets.ts

import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";
import { importParsedMail } from "@/lib/imapIngest";
import { loadContactProfile, decryptTicket, TICKET_LIST_INCLUDE } from "@/lib/tickets";
import { encryptField, blindIndex } from "@/lib/crypto";

const prisma = new PrismaClient();
let fails = 0;
const check = (n: string, c: boolean, x?: unknown) => {
  if (!c) { fails++; console.log("FAIL", n, x ?? ""); } else console.log("ok  ", n);
};

// Baut eine RFC-822-Rohmail. Header und Body MUESSEN durch genau eine
// Leerzeile getrennt sein, sonst liest der Parser den Body als Header weiter.
function raw(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
  extra?: string;
  date?: Date;
}) {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Message-ID: <${opts.messageId}>`,
    `Date: ${(opts.date ?? new Date()).toUTCString()}`,
    `Content-Type: text/plain; charset=utf-8`,
  ];
  if (opts.extra) headers.push(opts.extra);
  return Buffer.from(headers.join("\r\n") + "\r\n\r\n" + opts.body);
}

async function main() {
  // --- Stammdaten ---
  const admin = await prisma.user.create({
    data: { email: "admin@fb-akademie.de", name: "Dustyn Model", passwordHash: "x", role: "ADMIN" },
  });
  const training = await prisma.training.create({ data: { title: "Crashkurs Flüssigboden" } });
  const pastEvent = await prisma.event.create({
    data: {
      trainingId: training.id, title: "Crashkurs März 2026", createdById: admin.id,
      day1Date: new Date("2026-03-04"), day2Date: new Date("2026-03-05"),
    },
  });
  const futureEvent = await prisma.event.create({
    data: {
      trainingId: training.id, title: "Crashkurs Dezember 2026", createdById: admin.id,
      day1Date: new Date("2026-12-02"),
    },
  });
  const kundeMail = "maria.schmidt@bau-mueller.de";
  for (const [ev, status] of [[pastEvent, "ATTENDED"], [futureEvent, "REGISTERED"]] as const) {
    await prisma.participant.create({
      data: {
        eventId: ev.id,
        firstName: encryptField("Maria")!, lastName: encryptField("Schmidt")!,
        email: encryptField(kundeMail)!, emailHash: blindIndex(kundeMail),
        company: encryptField("Bau Müller GmbH"), phone: encryptField("0341 1234567"),
        status,
      },
    });
  }
  const mailbox = await prisma.mailbox.create({
    data: {
      address: "schulung@fb-akademie.de", label: "Schulung",
      imapHost: "imap.example.de", imapUser: "schulung@fb-akademie.de",
      imapPass: encryptField("geheim")!,
    },
  });

  // --- 1. Eingehende Kundenmail -> neues Ticket ---
  const m1 = await simpleParser(raw({
    from: `Maria Schmidt <${kundeMail}>`, to: "schulung@fb-akademie.de",
    subject: "Frage zur Anreise", body: "Guten Tag,\n\ngibt es Parkplätze vor Ort?\n\nViele Grüße\nMaria Schmidt",
    messageId: "kunde-1@bau-mueller.de", date: new Date("2026-02-01T09:00:00Z"),
  }));
  check("1. Mail legt Ticket an", (await importParsedMail(mailbox, m1, 101)) === "created");

  const t1 = await prisma.ticket.findFirst({ include: TICKET_LIST_INCLUDE });
  if (!t1) throw new Error("kein Ticket");
  const d1 = decryptTicket(t1);
  check("Referenz vergeben", /^FBA-/.test(d1.reference), d1.reference);
  check("Betreff entschluesselbar", d1.subject === "Frage zur Anreise", d1.subject);
  check("Absender entschluesselbar", d1.fromEmail === kundeMail, d1.fromEmail);
  check("Status NEW", d1.status === "NEW");
  check("Name aus Teilnehmer uebernommen", d1.fromName === "Maria Schmidt", d1.fromName);
  check("Firma aus Teilnehmer uebernommen", d1.fromCompany === "Bau Müller GmbH", d1.fromCompany);
  check("Klartext nicht in DB", !t1.subject.includes("Anreise") && !t1.fromEmail.includes("@"));

  // --- 2. Dieselbe Mail nochmal -> Duplikat ---
  check("Duplikat uebersprungen", (await importParsedMail(mailbox, m1, 101)) === "skipped");
  check("weiterhin 1 Ticket", (await prisma.ticket.count()) === 1);

  // --- 3. Kontaktprofil: Schulungshistorie ---
  const profile = await loadContactProfile(kundeMail, t1.id);
  check("2 Anmeldungen gefunden", profile.registrations.length === 2, profile.registrations.length);
  check("1 kommend", profile.upcoming.length === 1 && profile.upcoming[0].eventTitle === "Crashkurs Dezember 2026", profile.upcoming.map(r=>r.eventTitle));
  check("1 vergangen", profile.past.length === 1 && profile.past[0].eventTitle === "Crashkurs März 2026", profile.past.map(r=>r.eventTitle));
  check("Name aus Teilnehmer", profile.name === "Maria Schmidt", profile.name);
  check("Firma aus Teilnehmer", profile.company === "Bau Müller GmbH");
  check("Schulungstitel dabei", profile.past[0].trainingTitle === "Crashkurs Flüssigboden");

  // --- 4. Rueckantwort mit Referenz im Betreff -> selbes Ticket ---
  const m2 = await simpleParser(raw({
    from: `Maria Schmidt <${kundeMail}>`, to: "schulung@fb-akademie.de",
    subject: `Re: Frage zur Anreise [${d1.reference}]`,
    body: "Danke!\n\nAm 01.01.2026 schrieb FB-Akademie:\n> Ja, direkt am Haus.",
    messageId: "kunde-2@bau-mueller.de", date: new Date("2026-02-01T10:00:00Z"),
  }));
  check("Antwort wird zugeordnet", (await importParsedMail(mailbox, m2, 102)) === "appended");
  check("immer noch 1 Ticket", (await prisma.ticket.count()) === 1);
  check("2 Nachrichten", (await prisma.ticketMessage.count({ where: { ticketId: t1.id } })) === 2);

  // --- 5. Threading ueber In-Reply-To (ohne Referenz im Betreff) ---
  const m3 = await simpleParser(raw({
    from: `Maria Schmidt <${kundeMail}>`, to: "schulung@fb-akademie.de",
    subject: "Noch eine Sache", body: "Und wie ist die Adresse?",
    messageId: "kunde-3@bau-mueller.de", date: new Date("2026-02-01T11:00:00Z"),
    extra: "In-Reply-To: <kunde-1@bau-mueller.de>",
  }));
  check("In-Reply-To ordnet zu", (await importParsedMail(mailbox, m3, 103)) === "appended");
  check("3 Nachrichten", (await prisma.ticketMessage.count({ where: { ticketId: t1.id } })) === 3);

  // --- 6. Abwesenheitsnotiz wird ignoriert ---
  const m4 = await simpleParser(raw({
    from: `Kollege <kollege@firma.de>`, to: "schulung@fb-akademie.de",
    subject: "Automatische Antwort: Frage", body: "Bin im Urlaub.",
    messageId: "ooo-1@firma.de",
  }));
  check("Abwesenheit ignoriert", (await importParsedMail(mailbox, m4, 104)) === "skipped");

  // --- 7. Fremde Mail -> eigenes Ticket, ohne Historie ---
  const m5 = await simpleParser(raw({
    from: "Neu Kunde <neu@fremd.de>", to: "schulung@fb-akademie.de",
    subject: "Preisliste?", body: "Was kostet die Schulung?",
    messageId: "neu-1@fremd.de",
  }));
  check("neuer Absender -> neues Ticket", (await importParsedMail(mailbox, m5, 105)) === "created");
  check("jetzt 2 Tickets", (await prisma.ticket.count()) === 2);
  const p2 = await loadContactProfile("neu@fremd.de");
  check("keine Historie fuer Unbekannte", p2.registrations.length === 0);

  // --- 8. Eigene Kopie im Postfach wird nicht reimportiert ---
  const m6 = await simpleParser(raw({
    from: "FB-Akademie <schulung@fb-akademie.de>", to: kundeMail,
    subject: `Re: Frage zur Anreise [${d1.reference}]`, body: "Ja, direkt am Haus.",
    messageId: "eigen-1@fb-akademie.de",
  }));
  check("eigene Kopie ignoriert", (await importParsedMail(mailbox, m6, 106)) === "skipped");

  // --- 9. Zitat wurde beim Import gekuerzt ---
  const msgs = await prisma.ticketMessage.findMany({ where: { ticketId: t1.id }, orderBy: { sentAt: "asc" } });
  const { safeDecrypt } = await import("@/lib/crypto");
  const second = safeDecrypt(msgs[1].bodyText) ?? "";
  check("Zitat gekuerzt", second.trim() === "Danke!", JSON.stringify(second));

  console.log(fails === 0 ? "\nE2E: ALLE TESTS OK" : `\nE2E: ${fails} FEHLER`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
