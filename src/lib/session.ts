import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { AUD_PENDING, AUD_SESSION } from "./authAudience";

const COOKIE = "tm_session";
const PENDING_COOKIE = "tm_2fa_pending";
const MAX_AGE = 60 * 60 * 8; // 8h

// Jedes Token traegt seinen Verwendungszweck als Audience; jwtVerify
// verlangt ihn beim Pruefen. Die Werte stehen in einem eigenen, abhaengig-
// keitsfreien Modul, damit auch die Middleware sie nutzen kann.
export { AUD_SESSION, AUD_PENDING, AUD_CERT_PORTAL } from "./authAudience";

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET fehlt oder zu kurz.");
  return new TextEncoder().encode(s);
}

export interface SessionPayload extends JWTPayload {
  uid: string;
  role: Role;
  name: string;
  email: string;
  // Stand von User.sessionEpoch bei Ausstellung. Weicht er vom aktuellen
  // Stand ab, ist das Cookie widerrufen.
  ep?: number;
  // Impersonation: gesetzt, wenn ein Admin gerade als anderer User agiert.
  // Enthaelt die uid des Original-Admins, damit wir zurueckwechseln koennen.
  impersonatorUid?: string;
  impersonatorName?: string;
}

export interface PendingPayload extends JWTPayload {
  uid: string;
  // "totp"  = zweiter Faktor vorhanden, es fehlt nur noch die Eingabe
  // "setup" = Konto hat noch keinen zweiten Faktor und muss einen einrichten
  stage: "totp" | "setup";
}

async function sign(payload: JWTPayload, expSec: number, audience: string): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) + expSec)
    .sign(secret());
}

async function verify<T extends JWTPayload>(token: string, audience: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience });
    return payload as T;
  } catch {
    return null;
  }
}

/** Signiert ein Token fuer einen anderen Zweck als die Anmeldung (z.B. Portal). */
export async function signScopedToken(
  payload: JWTPayload,
  expSec: number,
  audience: string
): Promise<string> {
  return sign(payload, expSec, audience);
}

/** Prueft ein Token eines anderen Zwecks. Gibt null zurueck, wenn die Audience nicht passt. */
export async function verifyScopedToken<T extends JWTPayload>(
  token: string,
  audience: string
): Promise<T | null> {
  return verify<T>(token, audience);
}

/**
 * Angaben, aus denen eine Sitzung entsteht. Bewusst eine eigene Schnitt-
 * stelle statt Omit<SessionPayload, ...>: SessionPayload erbt von JWTPayload
 * dessen Index-Signatur, wodurch Omit alle Feldtypen auf unknown abflachen
 * wuerde.
 */
export interface NewSession {
  uid: string;
  role: Role;
  name: string;
  email: string;
  impersonatorUid?: string;
  impersonatorName?: string;
}

export async function createSession(p: NewSession) {
  // Den aktuellen Widerrufsstand mitgeben, damit das Cookie beim naechsten
  // Hochzaehlen von selbst ungueltig wird.
  const u = await prisma.user.findUnique({
    where: { id: p.uid },
    select: { sessionEpoch: true },
  });
  const token = await sign({ ...p, ep: u?.sessionEpoch ?? 0 }, MAX_AGE, AUD_SESSION);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  cookies().delete(COOKIE);
  cookies().delete(PENDING_COOKIE);
}

/**
 * Erklaert alle bestehenden Sitzungen eines Kontos fuer ungueltig.
 * Aufrufen bei Passwortwechsel, Kontosperre und Rollenentzug.
 */
export async function revokeSessions(uid: string) {
  await prisma.user.update({
    where: { id: uid },
    data: { sessionEpoch: { increment: 1 } },
  });
}

/**
 * Liest die Sitzung und gleicht sie gegen den aktuellen Kontostand ab.
 *
 * Das Cookie allein ist nicht massgeblich: Rolle und Kontostatus kommen bei
 * jedem Zugriff frisch aus der Datenbank. Ein Rollenentzug oder eine Sperre
 * wirkt damit sofort und nicht erst nach Ablauf der acht Stunden. Der
 * Datenbankzugriff wird pro Anfrage einmal ausgefuehrt (React-Cache), auch
 * wenn mehrere Komponenten die Sitzung abfragen.
 */
// React.cache dedupliziert den Datenbankzugriff innerhalb einer Anfrage.
// Ausserhalb der React-Laufzeit (Testskripte, CLI) gibt es die Funktion
// nicht - dort faellt es auf den ungecachten Aufruf zurueck.
const perRequest: <F>(fn: F) => F =
  typeof cache === "function" ? (cache as unknown as <F>(fn: F) => F) : (fn) => fn;

export const getSession = perRequest(async (): Promise<SessionPayload | null> => {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const p = await verify<SessionPayload>(token, AUD_SESSION);
  if (!p?.uid) return null;

  const u = await prisma.user.findUnique({
    where: { id: p.uid },
    select: { role: true, name: true, email: true, active: true, sessionEpoch: true },
  });
  if (!u || !u.active) return null;
  if ((p.ep ?? -1) !== u.sessionEpoch) return null;

  return { ...p, role: u.role, name: u.name, email: u.email };
});

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  return s;
}

export async function createPending(uid: string, stage: PendingPayload["stage"]) {
  const token = await sign({ uid, stage } as PendingPayload, 5 * 60, AUD_PENDING);
  cookies().set(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
}

export async function getPending(): Promise<PendingPayload | null> {
  const token = cookies().get(PENDING_COOKIE)?.value;
  if (!token) return null;
  const p = await verify<PendingPayload>(token, AUD_PENDING);
  if (!p?.uid) return null;
  if (p.stage !== "totp" && p.stage !== "setup") return null;
  return p;
}

export async function clearPending() {
  cookies().delete(PENDING_COOKIE);
}

// --- Einmalanzeige der Recovery-Codes -------------------------------------
// Die Codes sind gleichwertig zum zweiten Faktor. Als Query-Parameter
// landeten sie in der Browser-History, im Referer der naechsten Anfrage und
// in jedem Zugriffsprotokoll zwischen Proxy und Anwendung. Stattdessen ein
// kurzlebiges, nur fuer den Server lesbares Cookie.
const RECOVERY_COOKIE = "tm_recovery_once";
const RECOVERY_TTL = 10 * 60;

export function stashRecoveryCodes(codes: string[]) {
  cookies().set(RECOVERY_COOKIE, JSON.stringify(codes), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RECOVERY_TTL,
  });
}

export function readRecoveryCodes(): string[] {
  const raw = cookies().get(RECOVERY_COOKIE)?.value;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function clearRecoveryCodes() {
  cookies().delete(RECOVERY_COOKIE);
}

// --- Einmalanzeige eines Einladungs-/Reset-Links --------------------------
// Fallback, wenn kein Mailversand konfiguriert ist: Der Link enthaelt ein
// Token, mit dem sich ein Passwort setzen laesst. Aus demselben Grund wie
// bei den Recovery-Codes gehoert er nicht in die URL der Folgeseite.
const ONE_TIME_LINK_COOKIE = "tm_once_link";

export function stashOneTimeLink(link: string) {
  cookies().set(ONE_TIME_LINK_COOKIE, link, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
}

export function readOneTimeLink(): string | null {
  return cookies().get(ONE_TIME_LINK_COOKIE)?.value ?? null;
}

export function clearOneTimeLink() {
  cookies().delete(ONE_TIME_LINK_COOKIE);
}
