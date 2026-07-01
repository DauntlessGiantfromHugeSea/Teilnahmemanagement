// Beendet die Impersonation und stellt die Session des Original-Admins wieder her.

import { NextResponse } from "next/server";
import { getSession, createSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(_req: Request) {
  const s = await getSession();
  if (!s || !s.impersonatorUid) return new NextResponse("Nicht impersoniert.", { status: 400 });

  const admin = await prisma.user.findUnique({ where: { id: s.impersonatorUid } });
  if (!admin) return new NextResponse("Ursprungs-Admin nicht gefunden.", { status: 404 });

  await audit({
    actorId: admin.id,
    action: "IMPERSONATE_STOP",
    entityType: "User",
    entityId: s.uid,
    diff: { targetEmail: s.email },
  });

  await createSession({
    uid: admin.id,
    role: admin.role,
    name: admin.name,
    email: admin.email,
  });

  return new NextResponse(null, { status: 303, headers: { Location: `/admin/users` } });
}
