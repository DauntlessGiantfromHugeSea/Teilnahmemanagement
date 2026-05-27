import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

function back(qs: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/users?${qs}` },
  });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u) return back(`error=${encodeURIComponent("Nutzer nicht gefunden")}`);

  if (u.id === s.uid) {
    return back(`error=${encodeURIComponent("Sie koennen sich nicht selbst loeschen")}`);
  }

  if (u.role === "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true, id: { not: u.id } },
    });
    if (otherAdmins === 0) {
      return back(`error=${encodeURIComponent("Letzter aktiver Admin - Loeschen verweigert")}`);
    }
  }

  // Harte FK-Bindungen pruefen
  const [eventCount, commentCount] = await Promise.all([
    prisma.event.count({ where: { createdById: u.id } }),
    prisma.comment.count({ where: { authorId: u.id } }),
  ]);
  if (eventCount > 0 || commentCount > 0) {
    return back(
      `error=${encodeURIComponent(
        `Nutzer kann nicht geloescht werden: hat ${eventCount} Event(s) und ${commentCount} Kommentar(e) angelegt. Bitte stattdessen deaktivieren.`
      )}`
    );
  }

  // Loeschen - EventAccess cascaded, AuditLog wird auf actorId=null gesetzt.
  const email = u.email;
  await prisma.user.delete({ where: { id: u.id } });
  await audit({
    actorId: s.uid,
    action: "USER_DELETE",
    entityType: "User",
    entityId: u.id,
    diff: { email, role: u.role },
  });

  return back(`ok=${encodeURIComponent(`Nutzer ${email} geloescht`)}`);
}
