import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@prisma/client";

const COOKIE = "tm_session";
const PENDING_COOKIE = "tm_2fa_pending";
const MAX_AGE = 60 * 60 * 8; // 8h

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
}

export interface PendingPayload extends JWTPayload {
  uid: string;
  stage: "totp";
}

async function sign(payload: JWTPayload, expSec: number): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expSec)
    .sign(secret());
}

async function verify<T extends JWTPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

export async function createSession(p: Omit<SessionPayload, "iat" | "exp">) {
  const token = await sign(p, MAX_AGE);
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

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  return await verify<SessionPayload>(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  return s;
}

export async function createPending(uid: string) {
  const token = await sign({ uid, stage: "totp" } as PendingPayload, 5 * 60);
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
  return await verify<PendingPayload>(token);
}

export async function clearPending() {
  cookies().delete(PENDING_COOKIE);
}
