// Versuchsbegrenzung fuer den zweiten Faktor.
//
// Der Suchraum eines 6-stelligen Codes ist klein (10^6). Ohne Begrenzung
// laesst sich ein Faktor in ueberschaubarer Zeit durchprobieren, womit die
// gesamte Zweitfaktor-Pflicht wirkungslos waere. Der Zaehler haengt am
// Konto und gilt gemeinsam fuer TOTP, E-Mail-Code und Recovery-Codes -
// sonst setzte ein Wechsel des Verfahrens den Zaehler zurueck.

import { prisma } from "./db";

export const MAX_2FA_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export interface TwoFaGate {
  locked: boolean;
  until: Date | null;
}

const OPEN: TwoFaGate = { locked: false, until: null };

/** Prueft vor der Code-Pruefung, ob das Konto gerade gesperrt ist. */
export async function checkTwoFaGate(userId: string): Promise<TwoFaGate> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFaLockedUntil: true },
  });
  const until = u?.twoFaLockedUntil ?? null;
  if (until && until.getTime() > Date.now()) return { locked: true, until };
  return OPEN;
}

/**
 * Verbucht einen Fehlversuch und sperrt bei Erreichen der Obergrenze.
 * Das Hochzaehlen laeuft als atomares increment in der Datenbank, damit
 * parallele Anfragen nicht denselben Stand lesen und alle durchkommen.
 */
export async function registerTwoFaFailure(userId: string): Promise<TwoFaGate> {
  const now = new Date();

  // Eine abgelaufene Sperre setzt den Zaehler zurueck, sonst waere nach der
  // ersten Sperre jeder weitere Fehlversuch sofort wieder eine Sperre.
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFaLockedUntil: true },
  });
  if (before?.twoFaLockedUntil && before.twoFaLockedUntil.getTime() <= now.getTime()) {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFaFailedCount: 0, twoFaLockedUntil: null },
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { twoFaFailedCount: { increment: 1 } },
    select: { twoFaFailedCount: true },
  });

  if (updated.twoFaFailedCount >= MAX_2FA_ATTEMPTS) {
    const until = new Date(now.getTime() + LOCK_MINUTES * 60_000);
    // Zaehler zurueck auf 0: nach Ablauf der Sperre stehen wieder volle
    // MAX_2FA_ATTEMPTS Versuche zur Verfuegung.
    await prisma.user.update({
      where: { id: userId },
      data: { twoFaLockedUntil: until, twoFaFailedCount: 0 },
    });
    return { locked: true, until };
  }
  return OPEN;
}

/** Nach erfolgreichem zweiten Faktor aufrufen. */
export async function clearTwoFaFailures(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { twoFaFailedCount: 0, twoFaLockedUntil: null },
  });
}

/** Menschenlesbarer Hinweis fuer die Anmeldeseiten. */
export function lockedMessage(until: Date | null): string {
  if (!until) return "Zu viele Fehlversuche. Bitte später erneut versuchen.";
  const min = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return `Zu viele Fehlversuche. Bitte in ${min} Minuten erneut versuchen.`;
}
