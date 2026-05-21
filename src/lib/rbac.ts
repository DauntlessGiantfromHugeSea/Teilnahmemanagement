import { Role } from "@prisma/client";
import { prisma } from "./db";
import { getSession, type SessionPayload } from "./session";

export function isAdmin(s: SessionPayload | null) {
  return s?.role === Role.ADMIN;
}
export function canWriteGlobal(s: SessionPayload | null) {
  return s?.role === Role.ADMIN || s?.role === Role.EDITOR;
}
export function isAccounting(s: SessionPayload | null) {
  return s?.role === Role.ADMIN || s?.role === Role.ACCOUNTING;
}

export async function listAccessibleEventIds(s: SessionPayload): Promise<string[] | "ALL"> {
  if (s.role === Role.ADMIN || s.role === Role.ACCOUNTING) return "ALL";
  const grants = await prisma.eventAccess.findMany({
    where: { userId: s.uid },
    select: { eventId: true },
  });
  return grants.map((g) => g.eventId);
}

export async function canViewEvent(s: SessionPayload, eventId: string): Promise<boolean> {
  if (s.role === Role.ADMIN || s.role === Role.ACCOUNTING) return true;
  const g = await prisma.eventAccess.findUnique({
    where: { eventId_userId: { eventId, userId: s.uid } },
  });
  return !!g;
}

export async function canWriteEvent(s: SessionPayload, eventId: string): Promise<boolean> {
  if (s.role === Role.ADMIN) return true;
  if (s.role === Role.EDITOR) {
    const g = await prisma.eventAccess.findUnique({
      where: { eventId_userId: { eventId, userId: s.uid } },
    });
    return !!g?.canWrite || true; // Editors duerfen grundsaetzlich schreiben
  }
  return false;
}

export async function requireSessionOrThrow(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  return s;
}
