import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const STATUSES = new Set(["OPEN", "ANSWERED", "HIDDEN"]);

export async function POST(req: Request, { params }: { params: { id: string; qid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const status = String(f.get("status") ?? "OPEN");
  const adminNote = String(f.get("adminNote") ?? "").trim() || null;
  if (!STATUSES.has(status)) return new NextResponse("Ungültiger Status", { status: 400 });
  await prisma.eventQuestion.update({
    where: { id: params.qid },
    data: {
      status,
      adminNote,
      answeredAt: status === "ANSWERED" ? new Date() : null,
    },
  });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/questions?ok=Gespeichert.` },
  });
}
