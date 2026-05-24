import crypto from "node:crypto";

// Token wird im Klartext per Mail verschickt, in der DB nur als sha256-Hex gespeichert.
// Bei Verifikation hashen wir das eingehende Token und vergleichen die Hashes
// constant-time.

const TOKEN_BYTES = 32;
export const TOKEN_TTL_DAYS = 14;

export interface IssuedToken {
  token: string;       // Klartext fuer den Mail-Link
  hash: string;        // SHA-256-Hex zum Speichern
  expiresAt: Date;
}

export function issueToken(ttlDays: number = TOKEN_TTL_DAYS): IssuedToken {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  return { token, hash, expiresAt };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function constantTimeEqualsHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
