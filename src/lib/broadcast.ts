// Rundmail an viele Adressen.
//
// Zwei Versandarten, beide ueber denselben Weg wie alle anderen Mails
// (Microsoft Graph oder SMTP, siehe src/lib/mailer.ts):
//
//   BCC          Eine Mail je Block, alle Empfaenger im Blindkopie-Feld.
//                Schnell, die Empfaenger sehen einander nicht. Dafuer ohne
//                persoenliche Anrede - ein Text fuer alle.
//
//   EINZELN      Eine Mail je Empfaenger, Platzhalter werden ersetzt.
//                Langsamer, aber mit Anrede und besserer Zustellbarkeit.
//
// Exchange Online begrenzt: 500 Empfaenger je Nachricht, rund 30 Nachrichten
// je Minute und 10.000 Empfaenger am Tag. Die Werte unten bleiben darunter.

import { prisma } from "./db";
import { decryptParticipant } from "./participants";
import { sendMail, mailSenderAddress } from "./mailer";
import { getCompanySignature } from "./mailSignature";
import {
  fillPlaceholders,
  markupToHtml,
  markupToText,
  renderBroadcastHtml,
  type BroadcastVars,
} from "./broadcastMail";

/** Empfaenger je BCC-Nachricht. Exchange erlaubt 500; wir bleiben darunter. */
export const BCC_CHUNK = 200;
/** Pause zwischen zwei BCC-Bloecken. Es sind wenige, also grosszuegig. */
export const BCC_PAUSE_MS = 1200;
/** Pause zwischen zwei Einzelmails. */
export const SINGLE_PAUSE_MS = 250;
/** Obergrenze je Rundmail im BCC-Versand. */
export const MAX_RECIPIENTS = 2000;
/**
 * Obergrenze im Einzelversand. Eine Route darf hoechstens 300 Sekunden
 * laufen (maxDuration); bei rund einer halben Sekunde je Mail ist hier
 * Schluss. Groessere Verteiler gehen ueber BCC.
 */
export const MAX_RECIPIENTS_INDIVIDUAL = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParsedAddresses {
  valid: string[];
  invalid: string[];
  duplicates: number;
}

/**
 * Liest eine eingefuegte Adressliste. Erlaubt ist, was beim Kopieren aus
 * Outlook, Excel oder einer Textdatei herauskommt: Komma, Semikolon,
 * Zeilenumbruch oder Leerzeichen als Trenner, optional mit Anzeigename
 * davor ("Maria Schmidt <maria@…>").
 */
export function parseAddressList(raw: string): ParsedAddresses {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const piece of (raw ?? "").split(/[,;\n\r\t]+|\s{2,}/)) {
    const part = piece.trim();
    if (!part) continue;

    // "Name <adresse@…>" -> nur die Adresse
    const angled = /<([^>]+)>/.exec(part);
    const candidate = (angled ? angled[1] : part).trim().replace(/^mailto:/i, "");
    if (!candidate) continue;

    // Ein einzelnes Leerzeichen ohne spitze Klammern: der letzte Teil ist
    // die Adresse, alles davor ein Name.
    const token = candidate.includes(" ") ? candidate.split(/\s+/).pop()! : candidate;
    const lower = token.toLowerCase();

    if (!EMAIL_RE.test(lower)) {
      invalid.push(part.slice(0, 80));
      continue;
    }
    if (seen.has(lower)) {
      duplicates++;
      continue;
    }
    seen.add(lower);
    valid.push(lower);
  }
  return { valid, invalid, duplicates };
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export interface EventRecipient {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  eventTitle: string;
  eventDate: string;
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Holt die Teilnehmer der angegebenen Veranstaltungen.
 *
 * `allowedEventIds` ist die Freigabeliste des Aufrufers ("ALL" oder IDs,
 * siehe listAccessibleEventIds). Veranstaltungen ausserhalb davon werden
 * stillschweigend uebergangen - der Aufrufer darf ihre Teilnehmer nicht
 * einmal zaehlen.
 */
export async function collectEventRecipients(
  eventIds: string[],
  allowedEventIds: string[] | "ALL"
): Promise<{ recipients: EventRecipient[]; withoutEmail: number }> {
  const ids =
    allowedEventIds === "ALL" ? eventIds : eventIds.filter((id) => allowedEventIds.includes(id));
  if (ids.length === 0) return { recipients: [], withoutEmail: 0 };

  const events = await prisma.event.findMany({
    where: { id: { in: ids } },
    include: { participants: true },
  });

  const recipients: EventRecipient[] = [];
  const seen = new Set<string>();
  let withoutEmail = 0;

  for (const ev of events) {
    const date = fmtDate(ev.day1Date);
    for (const p of ev.participants) {
      const dec = decryptParticipant(p);
      const email = (dec.email ?? "").trim().toLowerCase();
      if (!email || !EMAIL_RE.test(email)) {
        withoutEmail++;
        continue;
      }
      // Wer in mehreren ausgewaehlten Veranstaltungen steht, bekommt die
      // Rundmail trotzdem nur einmal.
      if (seen.has(email)) continue;
      seen.add(email);
      recipients.push({
        email,
        firstName: dec.firstName ?? "",
        lastName: dec.lastName ?? "",
        company: dec.company ?? "",
        eventTitle: ev.title,
        eventDate: date,
      });
    }
  }
  return { recipients, withoutEmail };
}

export type BroadcastMode = "bcc" | "individual";

export interface BroadcastInput {
  subject: string;
  /** Rohtext aus dem Editor, mit Auszeichnung und Platzhaltern. */
  body: string;
  mode: BroadcastMode;
  /** Alle Empfaenger; bei "individual" mit Namen fuer die Platzhalter. */
  recipients: EventRecipient[];
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  /** Stille Kopie an die eigene Adresse, zur Ablage. */
  copyTo?: string;
  /** Nur fuer Tests: ueberspringt die Pausen zwischen den Nachrichten. */
  noDelay?: boolean;
}

export interface BroadcastResult {
  sent: number;
  failed: number;
  messages: number;
  errors: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function varsOf(r: EventRecipient): BroadcastVars {
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    company: r.company,
    eventTitle: r.eventTitle,
    eventDate: r.eventDate,
  };
}

/** Baut die fertige Mail fuer eine Vorschau oder einen Versand. */
export async function renderBroadcast(
  subject: string,
  body: string,
  vars: BroadcastVars,
  extras?: { ctaLabel?: string; ctaUrl?: string; footerNote?: string }
): Promise<{ subject: string; html: string; text: string }> {
  const company = await getCompanySignature();
  const filledSubject = fillPlaceholders(subject, vars);
  const filledBody = fillPlaceholders(body, vars);
  return {
    subject: filledSubject,
    html: renderBroadcastHtml({
      company,
      bodyHtml: markupToHtml(filledBody, company.accentColor),
      preheader: filledSubject,
      ctaLabel: extras?.ctaLabel,
      ctaUrl: extras?.ctaUrl,
      footerNote: extras?.footerNote,
    }),
    text: markupToText(filledBody),
  };
}

export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const result: BroadcastResult = { sent: 0, failed: 0, messages: 0, errors: [] };
  if (input.recipients.length === 0) return result;

  const company = await getCompanySignature();
  const sender = mailSenderAddress();

  const note = (msg: string) => {
    if (result.errors.length < 5) result.errors.push(msg);
  };

  if (input.mode === "bcc") {
    // Ein Text fuer alle: einmal bauen, nicht je Empfaenger.
    const html = renderBroadcastHtml({
      company,
      bodyHtml: markupToHtml(input.body, company.accentColor),
      preheader: input.subject,
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
      footerNote: input.footerNote,
    });
    const text = markupToText(input.body);
    const blocks = chunk(
      input.recipients.map((r) => r.email),
      BCC_CHUNK
    );

    for (const [i, block] of blocks.entries()) {
      const bcc = i === 0 && input.copyTo ? [...block, input.copyTo] : block;
      // Im To-Feld steht das eigene Postfach. Eine Mail ganz ohne To-Adresse
      // wird von vielen Servern als Spam gewertet.
      const res = await sendMail({
        to: sender ?? input.copyTo ?? block[0],
        bcc,
        subject: input.subject,
        text,
        html,
      });
      result.messages++;
      if (res.ok) result.sent += block.length;
      else {
        result.failed += block.length;
        note(`Block ${i + 1}: ${res.error ?? "Mailfehler"}`);
      }
      if (!input.noDelay && i < blocks.length - 1) await sleep(BCC_PAUSE_MS);
    }
    return result;
  }

  // Einzelversand mit Platzhaltern.
  for (const [i, r] of input.recipients.entries()) {
    const vars = varsOf(r);
    const subject = fillPlaceholders(input.subject, vars);
    const body = fillPlaceholders(input.body, vars);
    const res = await sendMail({
      to: r.email,
      subject,
      text: markupToText(body),
      html: renderBroadcastHtml({
        company,
        bodyHtml: markupToHtml(body, company.accentColor),
        preheader: subject,
        ctaLabel: input.ctaLabel,
        ctaUrl: input.ctaUrl,
        footerNote: input.footerNote,
      }),
      bcc: i === 0 && input.copyTo ? input.copyTo : undefined,
    });
    result.messages++;
    if (res.ok) result.sent++;
    else {
      result.failed++;
      note(`${r.email}: ${res.error ?? "Mailfehler"}`);
    }
    if (!input.noDelay && i < input.recipients.length - 1) await sleep(SINGLE_PAUSE_MS);
  }
  return result;
}
