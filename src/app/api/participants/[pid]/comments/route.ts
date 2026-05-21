import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const p = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const body = String(f.get("body") ?? "").trim();
  if (!body) return new NextResponse("body fehlt", { status: 400 });

  const c = await prisma.comment.create({
    data: { participantId: p.id, authorId: s.uid, body: encryptField(body)! },
  });
  await audit({
    actorId: s.uid,
    action: "COMMENT",
    entityType: "Comment",
    entityId: c.id,
    participantId: p.id,
  });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${p.eventId}/participants/${p.id}` } });
}
