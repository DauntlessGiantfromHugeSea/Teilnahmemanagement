import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import crypto from "node:crypto";

authenticator.options = { window: 1, step: 30 };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(secret: string, accountName: string, issuer = "FB-Akademie") {
  return authenticator.keyuri(accountName, issuer, secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.check(token.replace(/\s+/g, ""), secret);
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString("hex").match(/.{1,5}/g)!.join("-")
  );
}
