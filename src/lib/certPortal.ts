// Teilnehmer-Portal: OTP-Login per E-Mail, anschliessend Zugriff auf alle
// Zertifikate, die zu dieser E-Mail-Adresse gehören.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { blindIndex } from "./crypto";
import { AUD_CERT_PORTAL, signScopedToken, verifyScopedToken } from "./session";

const COOKIE = "cert_portal";
const TTL_MIN = 30;
const OTP_VALID_MIN = 10;

/** Hoechstzahl falscher Eingaben je ausgestelltem Code. */
export const MAX_OTP_ATTEMPTS = 5;
/** Hoechstzahl angeforderter Codes je Adresse innerhalb des Zeitfensters. */
export const MAX_OTP_REQUESTS = 5;
export const OTP_REQUEST_WINDOW_MIN = 15;

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** Vergleich in konstanter Zeit, damit die Laufzeit nichts ueber den Code verraet. */
function hashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function generateOtp(): string {
  // 6-stelliger Code, fuehrende Nullen erlaubt
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export function emailHashOf(email: string): string {
  return blindIndex(email.trim().toLowerCase());
}

export class OtpRateLimited extends Error {
  constructor() {
    super("Zu viele Code-Anforderungen.");
    this.name = "OtpRateLimited";
  }
}

export async function createOtp(email: string): Promise<{ code: string; emailHash: string }> {
  const emailHash = emailHashOf(email);
  const now = new Date();

  // Anforderungsbremse: ohne sie kann jemand beliebig viele Codes an eine
  // fremde Adresse ausloesen (Mailflut) und zugleich den Suchraum fuer das
  // Raten vergroessern, weil zu jedem Zeitpunkt ein frischer Code gilt.
  const windowStart = new Date(now.getTime() - OTP_REQUEST_WINDOW_MIN * 60_000);
  const recent = await prisma.certificateOtp.count({
    where: { emailHash, createdAt: { gt: windowStart } },
  });
  if (recent >= MAX_OTP_REQUESTS) throw new OtpRateLimited();

  // Aeltere Codes entwerten statt loeschen - geloeschte Zeilen wuerden die
  // Anforderungsbremse oben bei jedem Aufruf zuruecksetzen.
  await prisma.certificateOtp.updateMany({
    where: { emailHash, consumed: false },
    data: { consumed: true },
  });
  // Verbrauchte Zeilen aelter als einen Tag aufraeumen.
  await prisma.certificateOtp.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
  });

  const code = generateOtp();
  const expiresAt = new Date(now.getTime() + OTP_VALID_MIN * 60_000);
  await prisma.certificateOtp.create({
    data: { emailHash, codeHash: hashCode(code), expiresAt },
  });
  return { code, emailHash };
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const emailHash = emailHashOf(email);
  const otp = await prisma.certificateOtp.findFirst({
    where: { emailHash, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return false;

  // Den Versuch zuerst atomar verbuchen. Lesen-Pruefen-Schreiben waere
  // angreifbar: parallele Anfragen lesen denselben Zaehlerstand und kommen
  // alle durch, womit die Obergrenze von fuenf Versuchen praktisch entfaellt.
  // updateMany mit Bedingung im WHERE wird von der Datenbank als eine
  // Operation ausgefuehrt; count === 1 heisst "dieser Versuch gehoert mir".
  const claimed = await prisma.certificateOtp.updateMany({
    where: { id: otp.id, consumed: false, attempts: { lt: MAX_OTP_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return false;

  if (!hashEquals(otp.codeHash, hashCode(code.trim()))) return false;

  // Auch das Verbrauchen atomar, damit derselbe Code nicht zweimal zaehlt.
  const used = await prisma.certificateOtp.updateMany({
    where: { id: otp.id, consumed: false },
    data: { consumed: true },
  });
  return used.count === 1;
}

export async function setPortalCookie(email: string): Promise<void> {
  const emailHash = emailHashOf(email);
  const token = await signScopedToken({ emailHash }, TTL_MIN * 60, AUD_CERT_PORTAL);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MIN * 60,
  });
}

export async function getPortalEmailHash(): Promise<string | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  // Audience-gebunden: ein Sitzungs- oder Pending-Token ist mit demselben
  // Geheimnis signiert, aber nicht fuer das Portal ausgestellt.
  const payload = await verifyScopedToken<{ emailHash?: unknown }>(token, AUD_CERT_PORTAL);
  return typeof payload?.emailHash === "string" ? payload.emailHash : null;
}

export function clearPortalCookie(): void {
  cookies().delete(COOKIE);
}
