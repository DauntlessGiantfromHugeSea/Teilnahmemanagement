import { Prisma, TicketMsgDirection, TicketStatus } from "@prisma/client";
import { prisma } from "./db";
import { blindIndex, encryptField, safeDecrypt } from "./crypto";
import { newTicketReference } from "./ticketRef";

// Zentrale Helfer fuer Tickets: Ver-/Entschluesselung der Inhalte, Anlegen
// von Tickets und Nachrichten sowie das Matching eines Absenders auf
// Teilnehmer-Datensaetze (Schulungshistorie) und Newsletter-Abos.

export interface DecryptedMessage {
  id: string;
  direction: TicketMsgDirection;
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  authorId: string | null;
  authorName: string | null;
  sentAt: Date;
  attachments: { id: string; filename: string; size: number; contentType: string | null }[];
}

export interface DecryptedTicket {
  id: string;
  reference: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  fromEmail: string;
  fromName: string | null;
  fromCompany: string | null;
  mailbox: { id: string; address: string; label: string; color: string | null } | null;
  assignee: { id: string; name: string } | null;
  lastMessageAt: Date;
  lastInboundAt: Date | null;
  firstResponseAt: Date | null;
  createdAt: Date;
  messageCount: number;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type TicketRow = Prisma.TicketGetPayload<{
  include: {
    mailbox: { select: { id: true; address: true; label: true; color: true } };
    assignee: { select: { id: true; name: true } };
    _count: { select: { messages: true } };
  };
}>;

export const TICKET_LIST_INCLUDE = {
  mailbox: { select: { id: true, address: true, label: true, color: true } },
  assignee: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

export function decryptTicket(t: TicketRow): DecryptedTicket {
  return {
    id: t.id,
    reference: t.reference,
    subject: safeDecrypt(t.subject) ?? "(ohne Betreff)",
    status: t.status,
    priority: t.priority,
    fromEmail: safeDecrypt(t.fromEmail) ?? "",
    fromName: safeDecrypt(t.fromName),
    fromCompany: safeDecrypt(t.fromCompany),
    mailbox: t.mailbox,
    assignee: t.assignee,
    lastMessageAt: t.lastMessageAt,
    lastInboundAt: t.lastInboundAt,
    firstResponseAt: t.firstResponseAt,
    createdAt: t.createdAt,
    messageCount: t._count.messages,
  };
}

type MessageRow = Prisma.TicketMessageGetPayload<{
  include: {
    author: { select: { id: true; name: true } };
    attachments: true;
  };
}>;

export function decryptMessage(m: MessageRow): DecryptedMessage {
  return {
    id: m.id,
    direction: m.direction,
    fromEmail: safeDecrypt(m.fromEmail),
    fromName: safeDecrypt(m.fromName),
    toEmails: parseJsonArray(safeDecrypt(m.toEmails)),
    ccEmails: parseJsonArray(safeDecrypt(m.ccEmails)),
    subject: safeDecrypt(m.subject),
    bodyText: safeDecrypt(m.bodyText),
    bodyHtml: safeDecrypt(m.bodyHtml),
    authorId: m.authorId,
    authorName: m.author?.name ?? null,
    sentAt: m.sentAt,
    attachments: m.attachments.map((a) => ({
      id: a.id,
      filename: safeDecrypt(a.filename) ?? "anhang",
      size: a.size,
      contentType: a.contentType,
    })),
  };
}

// --- Anlegen ---------------------------------------------------------------

export interface NewTicketInput {
  mailboxId: string | null;
  subject: string;
  fromEmail: string;
  fromName?: string | null;
  status?: TicketStatus;
}

/**
 * Legt ein Ticket mit eindeutiger Referenz an. Kollisionen bei der Referenz
 * sind extrem unwahrscheinlich (32^10), werden aber trotzdem abgefangen.
 */
export async function createTicket(input: NewTicketInput) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newTicketReference();
    try {
      return await prisma.ticket.create({
        data: {
          reference,
          mailboxId: input.mailboxId,
          subject: encryptField(input.subject || "(ohne Betreff)")!,
          fromEmail: encryptField(input.fromEmail)!,
          fromEmailHash: blindIndex(input.fromEmail),
          fromName: encryptField(input.fromName ?? null),
          status: input.status ?? TicketStatus.NEW,
        },
      });
    } catch (e) {
      const isDuplicate =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isDuplicate) throw e;
    }
  }
  throw new Error("Konnte keine eindeutige Ticket-Referenz erzeugen");
}

export interface NewMessageInput {
  ticketId: string;
  mailboxId?: string | null;
  direction: TicketMsgDirection;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmails?: string[];
  ccEmails?: string[];
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  imapUid?: number | null;
  graphId?: string | null;
  authorId?: string | null;
  sentAt?: Date;
}

export async function addMessage(input: NewMessageInput) {
  const sentAt = input.sentAt ?? new Date();
  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: input.ticketId,
      mailboxId: input.mailboxId ?? null,
      direction: input.direction,
      fromEmail: encryptField(input.fromEmail ?? null),
      fromName: encryptField(input.fromName ?? null),
      toEmails: encryptField(input.toEmails?.length ? JSON.stringify(input.toEmails) : null),
      ccEmails: encryptField(input.ccEmails?.length ? JSON.stringify(input.ccEmails) : null),
      subject: encryptField(input.subject ?? null),
      bodyText: encryptField(input.bodyText ?? null),
      bodyHtml: encryptField(input.bodyHtml ?? null),
      messageId: input.messageId ?? null,
      inReplyTo: input.inReplyTo ?? null,
      references: input.references ?? null,
      imapUid: input.imapUid ?? null,
      graphId: input.graphId ?? null,
      authorId: input.authorId ?? null,
      sentAt,
    },
  });

  // Ticket-Metadaten nachziehen. Interne Notizen aendern den Status nicht.
  const ticket = await prisma.ticket.findUnique({ where: { id: input.ticketId } });
  if (ticket) {
    const data: Prisma.TicketUpdateInput = { lastMessageAt: sentAt };
    if (input.direction === TicketMsgDirection.INBOUND) {
      data.lastInboundAt = sentAt;
      // Kundenantwort holt ein erledigtes oder wartendes Ticket zurueck.
      if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.WAITING) {
        data.status = TicketStatus.OPEN;
        data.closedAt = null;
      }
    } else if (input.direction === TicketMsgDirection.OUTBOUND) {
      if (!ticket.firstResponseAt) data.firstResponseAt = sentAt;
      if (ticket.status === TicketStatus.NEW || ticket.status === TicketStatus.OPEN) {
        data.status = TicketStatus.WAITING;
      }
    }
    await prisma.ticket.update({ where: { id: input.ticketId }, data });
  }

  return message;
}

// --- Kontakt-Matching ------------------------------------------------------

export interface ContactRegistration {
  participantId: string;
  eventId: string;
  eventTitle: string;
  trainingTitle: string;
  day1Date: Date | null;
  day2Date: Date | null;
  cancelled: boolean;
  status: string;
  invoiceStatus: string;
  dayOption: string;
  certificates: { id: string; number: string; type: string; status: string }[];
}

export interface ContactProfile {
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  registrations: ContactRegistration[];
  upcoming: ContactRegistration[];
  past: ContactRegistration[];
  newsletter: { status: string; since: Date | null } | null;
  otherTicketCount: number;
}

/**
 * Sammelt alles, was wir ueber eine Absender-Adresse wissen: Teilnahmen
 * (vergangene und kommende), Zertifikate, Newsletter-Status und wie viele
 * weitere Tickets es von dieser Adresse gibt.
 *
 * Das Matching laeuft ausschliesslich ueber den Blind-Index der E-Mail,
 * Klartext-Adressen stehen nirgends in einer indizierten Spalte.
 */
export async function loadContactProfile(
  email: string,
  excludeTicketId?: string
): Promise<ContactProfile> {
  const hash = blindIndex(email);

  const [participants, subscriber, otherTicketCount] = await Promise.all([
    prisma.participant.findMany({
      where: { emailHash: hash },
      include: {
        event: { include: { training: { select: { title: true } } } },
        certificates: {
          select: { id: true, number: true, type: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.newsletterSubscriber.findUnique({ where: { emailHash: hash } }),
    prisma.ticket.count({
      where: { fromEmailHash: hash, ...(excludeTicketId ? { id: { not: excludeTicketId } } : {}) },
    }),
  ]);

  const registrations: ContactRegistration[] = participants.map((p) => ({
    participantId: p.id,
    eventId: p.eventId,
    eventTitle: p.event.title,
    trainingTitle: p.event.training.title,
    day1Date: p.event.day1Date,
    day2Date: p.event.day2Date,
    cancelled: p.event.cancelled,
    status: p.status,
    invoiceStatus: p.invoiceStatus,
    dayOption: p.dayOption,
    certificates: p.certificates,
  }));

  // Referenzdatum ist der letzte Schulungstag; ohne Datum gilt die Teilnahme
  // als "kommend", damit noch nicht terminierte Events nicht verschwinden.
  const now = Date.now();
  const endOf = (r: ContactRegistration): number | null => {
    const d = r.day2Date ?? r.day1Date;
    return d ? d.getTime() : null;
  };
  const upcoming = registrations
    .filter((r) => {
      const t = endOf(r);
      return t === null || t >= now;
    })
    .sort((a, b) => (endOf(a) ?? Infinity) - (endOf(b) ?? Infinity));
  const past = registrations
    .filter((r) => {
      const t = endOf(r);
      return t !== null && t < now;
    })
    .sort((a, b) => (endOf(b) ?? 0) - (endOf(a) ?? 0));

  const first = participants[0];
  const name = first
    ? [safeDecrypt(first.firstName), safeDecrypt(first.lastName)].filter(Boolean).join(" ") || null
    : null;

  return {
    email,
    name,
    company: first ? safeDecrypt(first.company) : null,
    phone: first ? safeDecrypt(first.phone) : null,
    registrations,
    upcoming,
    past,
    newsletter: subscriber
      ? { status: subscriber.status, since: subscriber.confirmedAt ?? subscriber.createdAt }
      : null,
    otherTicketCount,
  };
}

/**
 * Uebernimmt Name und Firma aus einem passenden Teilnehmer-Datensatz in das
 * Ticket, falls dort noch nichts steht. Wird nach dem Import aufgerufen.
 */
export async function enrichTicketFromParticipants(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  const participant = await prisma.participant.findFirst({
    where: { emailHash: ticket.fromEmailHash },
    orderBy: { createdAt: "desc" },
  });
  if (!participant) return;

  const data: Prisma.TicketUpdateInput = {};
  if (!ticket.fromName) {
    const name = [safeDecrypt(participant.firstName), safeDecrypt(participant.lastName)]
      .filter(Boolean)
      .join(" ");
    if (name) data.fromName = encryptField(name);
  }
  if (!ticket.fromCompany) {
    const company = safeDecrypt(participant.company);
    if (company) data.fromCompany = encryptField(company);
  }
  if (Object.keys(data).length > 0) {
    await prisma.ticket.update({ where: { id: ticketId }, data });
  }
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "Neu",
  OPEN: "In Bearbeitung",
  WAITING: "Wartet auf Kunde",
  CLOSED: "Erledigt",
};

export const STATUS_CLASS: Record<TicketStatus, string> = {
  NEW: "bg-rose-100 text-rose-800",
  OPEN: "bg-amber-100 text-amber-800",
  WAITING: "bg-sky-100 text-sky-800",
  CLOSED: "bg-slate-100 text-slate-600",
};

export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Niedrig",
  NORMAL: "Normal",
  HIGH: "Hoch",
};
