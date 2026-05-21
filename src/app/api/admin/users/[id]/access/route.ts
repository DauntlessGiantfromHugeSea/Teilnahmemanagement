import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return new NextResponse("Not found", { status: 404 });

  const f = await req.formData();
  const viewEventIds = new Set<string>();
  const writeEventIds = new Set<string>();
  for (const [key] of f.entries()) {
    if (key.startsWith("view_")) viewEventIds.add(key.slice(5));
    else if (key.startsWith("write_")) writeEventIds.add(key.slice(6));
  }

  const existing = await prisma.eventAccess.findMany({ where: { userId: user.id } });
  const existingMap = new Map(existing.map((g) => [g.eventId, g]));

  // Anzulegen / zu aktualisieren
  for (const eventId of viewEventIds) {
    const canWrite = writeEventIds.has(eventId);
    const cur = existingMap.get(eventId);
    if (!cur) {
      await prisma.eventAccess.create({ data: { eventId, userId: user.id, canWrite } });
    } else if (cur.canWrite !== canWrite) {
      await prisma.eventAccess.update({ where: { id: cur.id }, data: { canWrite } });
    }
  }
  // Zu entfernen
  for (const g of existing) {
    if (!viewEventIds.has(g.eventId)) {
      await prisma.eventAccess.delete({ where: { id: g.id } });
    }
  }

  await audit({
    actorId: s.uid,
    action: "USER_ACCESS_UPDATE",
    entityType: "User",
    entityId: user.id,
    diff: { view: [...viewEventIds], write: [...writeEventIds] },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/users/${user.id}/access?ok=1` },
  });
}
