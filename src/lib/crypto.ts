import crypto from "node:crypto";

// AES-256-GCM Feldverschluesselung.
// Format: base64( version(1) || iv(12) || tag(16) || ciphertext )
const VERSION = 0x01;

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY fehlt oder hat falsche Laenge (64 hex chars / 32 bytes)."
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, enc]).toString("base64");
}

export function decryptField(payload: string | null | undefined): string | null {
  if (payload == null || payload === "") return null;
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 1 + 12 + 16 + 1) return null;
  const version = buf[0];
  if (version !== VERSION) throw new Error("Unbekannte Verschluesselungs-Version");
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const enc = buf.subarray(29);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function safeDecrypt(payload: string | null | undefined): string | null {
  try {
    return decryptField(payload);
  } catch {
    return null;
  }
}

// Blind index fuer E-Mail-Lookup. HMAC-SHA-256 mit dem gleichen Key,
// damit identische Inputs deterministisch denselben Hash liefern.
export function blindIndex(value: string): string {
  const normalized = value.trim().toLowerCase();
  return crypto.createHmac("sha256", getKey()).update(normalized).digest("hex");
}
