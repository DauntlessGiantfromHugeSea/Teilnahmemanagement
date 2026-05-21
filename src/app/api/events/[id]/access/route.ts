import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const userId = String(f.get("userId") ?? "");
  const canWrite = f.get("canWrite") === "on";
  if (!userId) return new NextResponse("userId fehlt", { status: 400 });
  await prisma.eventAccess.upsert({
    where: { eventId_userId: { eventId: params.id, userId } },
    create: { eventId: params.id, userId, canWrite },
    update: { canWrite },
  });
  await audit({ actorId: s.uid, action: "GRANT", entityType: "EventAccess", entityId: params.id, diff: { userId, canWrite } });
  return new NextResponse(null, { status: 303, headers: { Location: `/events/${params.id}/access` } });
}
