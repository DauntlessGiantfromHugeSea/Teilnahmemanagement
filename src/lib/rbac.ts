import { Role } from "@prisma/client";
import { prisma } from "./db";
import { getSession, type SessionPayload } from "./session";

export function isAdmin(s: SessionPayload | null) {
  return s?.role === Role.ADMIN;
}
export function canWriteGlobal(s: SessionPayload | null) {
  return s?.role === Role.ADMIN || s?.role === Role.EDITOR || s?.role === Role.EVENTMANAGER;
}
export function isAccounting(s: SessionPayload | null) {
  return s?.role === Role.ADMIN || s?.role === Role.ACCOUNTING;
}
export function isEventManager(s: SessionPayload | null) {
  return s?.role === Role.ADMIN || s?.role === Role.EVENTMANAGER;
}

export async function listAccessibleEventIds(s: SessionPayload): Promise<string[] | "ALL"> {
  // Admins und Buchhaltung sehen alles. EVENTMANAGER und EDITOR brauchen
  // explizite Freigabe pro Veranstaltung (EventAccess).
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
    // Bestehendes Verhalten: Editoren duerfen alles schreiben.
    return true;
  }
  if (s.role === Role.EVENTMANAGER || s.role === Role.VIEWER) {
    // Auf einzelnen Veranstaltungen: Schreibrechte moeglich, wenn der Admin
    // in EventAccess canWrite=true gesetzt hat. Betrachter ohne Grant sehen
    // die Veranstaltung nur lesend.
    const g = await prisma.eventAccess.findUnique({
      where: { eventId_userId: { eventId, userId: s.uid } },
    });
    return !!g?.canWrite;
  }
  return false;
}

export async function requireSessionOrThrow(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  return s;
}
