// Meldet den Admin voruebergehend als anderen User an. Original-Admin-ID wird
// in der Session mitgefuehrt, damit /api/admin/users/impersonate/stop
// zurueckwechseln kann. Nur ADMIN darf das.

import { NextResponse } from "next/server";
import { getSession, createSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  // Bereits impersoniert? Dann darf nicht verkettet werden.
  if (s.impersonatorUid) return new NextResponse("Bereits als anderer User angemeldet.", { status: 400 });
  if (params.id === s.uid) return new NextResponse("Das bist du selbst.", { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return new NextResponse("User nicht gefunden.", { status: 404 });
  if (!target.active) return new NextResponse("Ziel-Konto ist deaktiviert.", { status: 400 });

  await audit({
    actorId: s.uid,
    action: "IMPERSONATE_START",
    entityType: "User",
    entityId: target.id,
    diff: { targetEmail: target.email },
  });

  await createSession({
    uid: target.id,
    role: target.role,
    name: target.name,
    email: target.email,
    impersonatorUid: s.uid,
    impersonatorName: s.name,
  });

  return new NextResponse(null, { status: 303, headers: { Location: "/dashboard" } });
}
