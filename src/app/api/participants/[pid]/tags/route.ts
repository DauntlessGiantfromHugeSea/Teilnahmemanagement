import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

// POST: ?action=add|remove&tagId=...
export async function POST(req: Request, { params }: { params: { pid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  const p = await prisma.participant.findUnique({ where: { id: params.pid } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, p.eventId))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const action = String(f.get("action") ?? "add");
  const tagId = String(f.get("tagId") ?? "");

  const back = new NextResponse(null, {
    status: 303,
    headers: {
      Location: req.headers.get("referer") ?? `/events/${p.eventId}/participants/${p.id}`,
    },
  });

  if (!tagId) return back;
  if (action === "remove") {
    await prisma.participantTagLink.deleteMany({
      where: { participantId: p.id, tagId },
    }).catch(() => null);
  } else {
    await prisma.participantTagLink.upsert({
      where: { participantId_tagId: { participantId: p.id, tagId } },
      create: { participantId: p.id, tagId, autoAssigned: false },
      update: { autoAssigned: false },
    }).catch(() => null);
  }
  return back;
}
