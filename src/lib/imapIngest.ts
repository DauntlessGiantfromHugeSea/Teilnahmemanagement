import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import { TicketMsgDirection, type Mailbox } from "@prisma/client";
import { prisma } from "./db";
import { mailboxImapCredentials } from "./mailbox";
import { addMessage, createTicket, enrichTicketFromParticipants } from "./tickets";
import { findTicketReference } from "./ticketRef";
import { sanitizeIncomingHtml, stripQuotedReply } from "./mailHtml";

// Abholen der Kundenmails per IMAP.
//
// Pro Postfach werden alle Nachrichten mit einer UID groesser als der zuletzt
// verarbeiteten geholt. Der UID-Zaehler (plus uidValidity) ist der einzige
// Fortschrittsmarker - wir setzen keine \Seen-Flags und verschieben nichts,
// damit das Postfach parallel ganz normal in Outlook/Webmail nutzbar bleibt.
//
// Zuordnung einer eingehenden Mail zu einem Ticket, in dieser Reihenfolge:
//   1. In-Reply-To / References treffen eine bekannte Message-ID
//   2. Ticket-Referenz (FBA-XXXXX-XXXXX) in Betreff oder Body
//   3. sonst: neues Ticket

export interface IngestResult {
  mailbox: string;
  fetched: number;
  created: number;
  appended: number;
  skipped: number;
  error?: string;
}

const MAX_PER_RUN = 50;

function firstAddress(addr: AddressObject | AddressObject[] | undefined): {
  email: string;
  name: string | null;
} | null {
  const list = Array.isArray(addr) ? addr : addr ? [addr] : [];
  for (const a of list) {
    for (const v of a.value) {
      if (v.address) return { email: v.address.trim().toLowerCase(), name: v.name?.trim() || null };
    }
  }
  return null;
}

function allAddresses(addr: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(addr) ? addr : addr ? [addr] : [];
  const out: string[] = [];
  for (const a of list) {
    for (const v of a.value) if (v.address) out.push(v.address.trim().toLowerCase());
  }
  return out;
}

/**
 * Erkennt Automaten-Mails (Abwesenheit, Bounce, Mailer-Daemon). Die sollen
 * kein Ticket aufmachen - sonst fuellt sich der Posteingang mit Rauschen.
 */
function isAutomated(parsed: ParsedMail): boolean {
  const headers = parsed.headers;
  const autoSubmitted = String(headers.get("auto-submitted") ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers.get("x-autoreply") || headers.get("x-autorespond")) return true;
  const precedence = String(headers.get("precedence") ?? "").toLowerCase();
  if (["bulk", "junk", "auto_reply", "list"].includes(precedence)) return true;
  const from = firstAddress(parsed.from)?.email ?? "";
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/i.test(from)) return true;
  const subject = (parsed.subject ?? "").toLowerCase();
  return /^(automatische antwort|automatic reply|out of office|abwesenheit|undeliverable|delivery status notification)/i.test(
    subject
  );
}

/** Message-IDs aus In-Reply-To + References, neueste zuerst. */
function threadCandidates(parsed: ParsedMail): string[] {
  const out: string[] = [];
  if (parsed.inReplyTo) out.push(parsed.inReplyTo.trim());
  const refs = parsed.references;
  if (typeof refs === "string") out.push(...refs.split(/\s+/));
  else if (Array.isArray(refs)) out.push(...refs);
  return out.map((r) => r.trim()).filter(Boolean).reverse();
}

async function findTicketForMail(parsed: ParsedMail, bodyText: string): Promise<string | null> {
  // 1) Header-Threading
  const candidates = threadCandidates(parsed);
  if (candidates.length > 0) {
    const hit = await prisma.ticketMessage.findFirst({
      where: { messageId: { in: candidates } },
      select: { ticketId: true },
    });
    if (hit) return hit.ticketId;
  }

  // 2) Referenz im Betreff oder Text
  const ref = findTicketReference(parsed.subject, bodyText);
  if (ref) {
    const ticket = await prisma.ticket.findUnique({ where: { reference: ref }, select: { id: true } });
    if (ticket) return ticket.id;
  }

  return null;
}

/** Holt neue Mails eines Postfachs ab und legt Tickets/Nachrichten an. */
export async function ingestMailbox(mb: Mailbox): Promise<IngestResult> {
  const result: IngestResult = { mailbox: mb.address, fetched: 0, created: 0, appended: 0, skipped: 0 };
  const creds = mailboxImapCredentials(mb);
  if (!creds) {
    result.error = "IMAP-Zugangsdaten unvollständig";
    await prisma.mailbox.update({
      where: { id: mb.id },
      data: { lastPollAt: new Date(), lastError: result.error },
    });
    return result;
  }

  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapSecure,
    auth: { user: creds.imapUser, pass: creds.imapPass },
    logger: false,
    socketTimeout: 60_000,
  });

  let lastUid = mb.lastUid;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(creds.imapFolder);
    try {
      const box = client.mailbox;
      const uidValidity = box && typeof box !== "boolean" ? String(box.uidValidity) : null;

      // Neu angelegtes Postfach (lastUid=0): nicht das komplette Archiv
      // importieren, sondern ab jetzt mitlesen.
      if (mb.lastUid === 0 && mb.uidValidity === null) {
        const nextUid = box && typeof box !== "boolean" ? Number(box.uidNext ?? 1) : 1;
        await prisma.mailbox.update({
          where: { id: mb.id },
          data: { lastUid: Math.max(0, nextUid - 1), uidValidity, lastPollAt: new Date(), lastError: null },
        });
        return result;
      }

      // Hat der Server die UIDs neu vergeben, faengt die Zaehlung von vorn an.
      if (uidValidity && mb.uidValidity && uidValidity !== mb.uidValidity) {
        lastUid = 0;
      }

      // search() liefert false, wenn der Server die Suche ablehnt.
      const searched = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      const uids: number[] = Array.isArray(searched) ? searched : [];
      const fresh = uids
        .filter((u) => u > lastUid)
        .sort((a, b) => a - b)
        .slice(0, MAX_PER_RUN);
      result.fetched = fresh.length;

      for (const uid of fresh) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || typeof msg === "boolean" || !msg.source) {
            lastUid = Math.max(lastUid, uid);
            continue;
          }
          const outcome = await importParsedMail(mb, await simpleParser(msg.source), uid);
          if (outcome === "created") result.created++;
          else if (outcome === "appended") result.appended++;
          else result.skipped++;
        } catch (e) {
          console.error(`[imap] ${mb.address} UID ${uid}: ${(e as Error).message}`);
          result.skipped++;
        }
        lastUid = Math.max(lastUid, uid);
      }

      await prisma.mailbox.update({
        where: { id: mb.id },
        data: { lastUid, uidValidity, lastPollAt: new Date(), lastError: null },
      });
    } finally {
      lock.release();
    }
  } catch (e) {
    result.error = (e as Error).message;
    console.error(`[imap] ${mb.address}: ${result.error}`);
    await prisma.mailbox.update({
      where: { id: mb.id },
      data: { lastUid, lastPollAt: new Date(), lastError: result.error.slice(0, 500) },
    });
  } finally {
    try {
      await client.logout();
    } catch {
      /* Verbindung ist ohnehin hin */
    }
  }

  return result;
}

type Outcome = "created" | "appended" | "skipped";

/** Importiert eine geparste Mail. Exportiert, damit Tests sie direkt nutzen koennen. */
export async function importParsedMail(
  mb: Mailbox,
  parsed: ParsedMail,
  uid?: number
): Promise<Outcome> {
  const messageId = parsed.messageId?.trim() || null;
  if (messageId) {
    const existing = await prisma.ticketMessage.findUnique({ where: { messageId } });
    if (existing) return "skipped"; // schon importiert
  }

  const from = firstAddress(parsed.from);
  if (!from) return "skipped";

  // Eigene Antworten, die als Kopie im Postfach liegen, nicht erneut
  // importieren - sie stehen schon als OUTBOUND im Thread.
  if (from.email === mb.address.toLowerCase()) return "skipped";

  if (isAutomated(parsed)) return "skipped";

  const rawText = parsed.text ?? "";
  const bodyText = stripQuotedReply(rawText);
  const bodyHtml = parsed.html ? sanitizeIncomingHtml(parsed.html) : null;
  const subject = (parsed.subject ?? "").trim() || "(ohne Betreff)";
  const sentAt = parsed.date ?? new Date();

  let ticketId = await findTicketForMail(parsed, rawText);
  let outcome: Outcome = "appended";
  if (!ticketId) {
    const ticket = await createTicket({
      mailboxId: mb.id,
      subject,
      fromEmail: from.email,
      fromName: from.name,
    });
    ticketId = ticket.id;
    outcome = "created";
  }

  await addMessage({
    ticketId,
    mailboxId: mb.id,
    direction: TicketMsgDirection.INBOUND,
    fromEmail: from.email,
    fromName: from.name,
    toEmails: allAddresses(parsed.to),
    ccEmails: allAddresses(parsed.cc),
    subject,
    bodyText: bodyText || null,
    bodyHtml,
    messageId,
    inReplyTo: parsed.inReplyTo?.trim() || null,
    references: threadCandidates(parsed).join(" ") || null,
    imapUid: uid ?? null,
    sentAt,
  });

  if (outcome === "created") await enrichTicketFromParticipants(ticketId);

  return outcome;
}

/** Holt alle aktiven Postfaecher ab. */
export async function ingestAllMailboxes(): Promise<IngestResult[]> {
  const boxes = await prisma.mailbox.findMany({ where: { active: true }, orderBy: { label: "asc" } });
  const results: IngestResult[] = [];
  for (const mb of boxes) {
    results.push(await ingestMailbox(mb));
  }
  return results;
}
