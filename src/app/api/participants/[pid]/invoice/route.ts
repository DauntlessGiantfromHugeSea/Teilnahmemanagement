import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent, isAccounting } from "@/lib/rbac";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { InvoiceStatus } from "@prisma/client";

export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const p = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  const allowed = isAccounting(s) || (await canWriteEvent(s, p.eventId));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const status = String(f.get("invoiceStatus") ?? p.invoiceStatus) as InvoiceStatus;
  const invoiceNumber = String(f.get("invoiceNumber") ?? "").trim() || null;
  const invoiceNotesPlain = String(f.get("invoiceNotes") ?? "").trim();
  const invoiceNotes = invoiceNotesPlain ? encryptField(invoiceNotesPlain) : null;

  const now = new Date();
  const data: any = { invoiceStatus: status, invoiceNumber, invoiceNotes };
  if (status === "ISSUED" && !p.invoiceIssuedAt) data.invoiceIssuedAt = now;
  if (status === "PAID" && !p.invoicePaidAt) data.invoicePaidAt = now;

  await prisma.participant.update({ where: { id: p.id }, data });
  await audit({
    actorId: s.uid,
    action: "INVOICE_STATUS",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
    diff: { from: p.invoiceStatus, to: status, invoiceNumber },
  });
  const back = req.headers.get("referer") ?? `/events/${p.eventId}/participants/${p.id}`;
  return new NextResponse(null, { status: 303, headers: { Location: back } });
}
