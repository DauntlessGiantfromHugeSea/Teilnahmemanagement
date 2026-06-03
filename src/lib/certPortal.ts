// Teilnehmer-Portal: OTP-Login per E-Mail, anschliessend Zugriff auf alle
// Zertifikate, die zu dieser E-Mail-Adresse gehören.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { blindIndex } from "./crypto";

const COOKIE = "cert_portal";
const TTL_MIN = 30;
const OTP_VALID_MIN = 10;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (!s) throw new Error("SESSION_SECRET missing");
  return new TextEncoder().encode(s);
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function generateOtp(): string {
  // 6-stelliger Code, fuehrende Nullen erlaubt
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export function emailHashOf(email: string): string {
  return blindIndex(email.trim().toLowerCase());
}

export async function createOtp(email: string): Promise<{ code: string; emailHash: string }> {
  const emailHash = emailHashOf(email);
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_VALID_MIN * 60_000);
  // Aelteren, nicht-verbrauchten OTP fuer dieselbe Adresse loeschen
  await prisma.certificateOtp.deleteMany({ where: { emailHash, consumed: false } });
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
  if (otp.attempts >= 5) return false;
  if (otp.codeHash !== hashCode(code.trim())) {
    await prisma.certificateOtp.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } });
    return false;
  }
  await prisma.certificateOtp.update({ where: { id: otp.id }, data: { consumed: true } });
  return true;
}

export async function setPortalCookie(email: string): Promise<void> {
  const emailHash = emailHashOf(email);
  const token = await new SignJWT({ emailHash })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${TTL_MIN}m`)
    .setIssuedAt()
    .sign(secret());
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
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.emailHash === "string" ? payload.emailHash : null;
  } catch {
    return null;
  }
}

export function clearPortalCookie(): void {
  cookies().delete(COOKIE);
}
