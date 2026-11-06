import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createSession, getSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
  const f = await req.formData();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  if (next.length < 10) {
    return new NextResponse(null, { status: 303, headers: { Location: `/account/password?error=length` } });
  }
  const u = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!u || !(await verifyPassword(current, u.passwordHash))) {
    return new NextResponse(null, { status: 303, headers: { Location: `/account/password?error=current` } });
  }
  // Passwortwechsel meldet alle Sitzungen des Kontos ab (sessionEpoch).
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(next), sessionEpoch: { increment: 1 } },
  });
  // ... ausser dieser hier: der Benutzer hat sein altes Passwort gerade
  // nachgewiesen, er soll nicht mitten im Vorgang herausfliegen.
  await createSession({
    uid: s.uid,
    role: u.role,
    name: u.name,
    email: u.email,
    impersonatorUid: s.impersonatorUid,
    impersonatorName: s.impersonatorName,
  });
  await audit({ actorId: u.id, action: "PASSWORD_CHANGED", entityType: "Auth", entityId: u.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/account/password?ok=1` } });
}
