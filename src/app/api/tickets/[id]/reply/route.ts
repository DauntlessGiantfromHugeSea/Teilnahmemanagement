import { NextResponse } from "next/server";
import { TicketMsgDirection } from "@prisma/client";
import { getSession } from "@/lib/session";
import { canUseTickets } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { safeDecrypt } from "@/lib/crypto";
import { addMessage } from "@/lib/tickets";
import { buildReply, sendTicketReply } from "@/lib/ticketMail";
import { replySubject, subjectWithReference } from "@/lib/ticketRef";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAddresses(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EMAIL_RE.test(s));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !canUseTickets(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const body = String(f.get("body") ?? "").trim();
  const ccRaw = String(f.get("cc") ?? "");
  const toOverride = String(f.get("to") ?? "").trim();
  const preview = String(f.get("preview") ?? "") === "1";

  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/posteingang/${params.id}?${new URLSearchParams(q).toString()}` },
    });

  if (!body) return back({ error: "Die Antwort ist leer." });

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: {
      mailbox: true,
      messages: { orderBy: { sentAt: "desc" }, take: 20 },
    },
  });
  if (!ticket) return new NextResponse("Not found", { status: 404 });
  if (!ticket.mailbox) return back({ error: "Dem Ticket ist kein Postfach zugeordnet." });

  const user = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!user) return new NextResponse("Forbidden", { status: 403 });

  // Vorschau: nur rendern, nichts verschicken.
  if (preview) {
    const built = await buildReply({ ticket, mailbox: ticket.mailbox, bodyText: body, user });
    return new NextResponse(built.html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const to = toOverride
    ? parseAddresses(toOverride)
    : [safeDecrypt(ticket.fromEmail) ?? ""].filter((a) => EMAIL_RE.test(a));
  if (to.length === 0) return back({ error: "Keine gültige Empfängeradresse." });
  const cc = parseAddresses(ccRaw);

  // Threading-Header aus der letzten eingehenden Nachricht.
  const lastInbound = ticket.messages.find((m) => m.direction === TicketMsgDirection.INBOUND);
  const inReplyTo = lastInbound?.messageId ?? null;
  const references = [lastInbound?.references, lastInbound?.messageId].filter(Boolean).join(" ") || null;

  const baseSubject = safeDecrypt(ticket.subject) ?? "(ohne Betreff)";
  const subject = replySubject(baseSubject);

  const result = await sendTicketReply({
    ticket,
    mailbox: ticket.mailbox,
    bodyText: body,
    user,
    subject,
    to,
    cc,
    inReplyTo,
    references,
    replyToGraphId: lastInbound?.graphId ?? null,
  });

  if (!result.ok) return back({ error: `Versand fehlgeschlagen: ${result.error ?? "unbekannt"}` });

  await addMessage({
    ticketId: ticket.id,
    mailboxId: ticket.mailboxId,
    direction: TicketMsgDirection.OUTBOUND,
    fromEmail: ticket.mailbox.address,
    fromName: ticket.mailbox.fromName ?? ticket.mailbox.label,
    toEmails: to,
    ccEmails: cc,
    subject: subjectWithReference(subject, ticket.reference),
    bodyText: body,
    messageId: result.messageId ?? null,
    inReplyTo,
    references,
    authorId: s.uid,
  });

  await audit({
    actorId: s.uid,
    action: "TICKET_REPLY",
    entityType: "Ticket",
    entityId: ticket.id,
    diff: { reference: ticket.reference, recipients: to.length },
  });

  return back({ ok: "Antwort verschickt." });
}
