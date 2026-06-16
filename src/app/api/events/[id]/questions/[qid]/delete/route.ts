import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string; qid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  await prisma.eventQuestion.delete({ where: { id: params.qid } }).catch(() => null);
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/questions?ok=Frage%20gel%C3%B6scht.` },
  });
}
