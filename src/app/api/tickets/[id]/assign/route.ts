import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canUseTickets } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !canUseTickets(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const assigneeId = String(f.get("assigneeId") ?? "").trim();
  const from = String(f.get("from") ?? "");
  const location = from === "list" ? "/posteingang" : `/posteingang/${params.id}`;
  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `${location}?${new URLSearchParams(q).toString()}` },
    });

  if (assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
    if (!user) return back({ error: "Benutzer nicht gefunden." });
  }

  await prisma.ticket.update({
    where: { id: params.id },
    data: { assigneeId: assigneeId || null },
  });

  return back({ ok: assigneeId ? "Ticket zugewiesen." : "Zuweisung aufgehoben." });
}
