import crypto from "node:crypto";

// 6-stelliger numerischer Login-Code. Im Klartext per Mail verschickt,
// in der DB als sha256-Hex gespeichert. Gueltig 10 Minuten.

const TTL_MIN = 10;

export interface IssuedLoginCode {
  code: string;       // "123456"
  hash: string;       // sha256 hex
  expiresAt: Date;
}

export function issueLoginCode(): IssuedLoginCode {
  // 6-stellige Zufallszahl, fuehrende Nullen erhalten
  const n = crypto.randomInt(0, 1_000_000);
  const code = n.toString().padStart(6, "0");
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000);
  return { code, hash, expiresAt };
}

export function hashLoginCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}
