import { prisma } from "./db";
import { encryptField, safeDecrypt, blindIndex } from "./crypto";
import type { Participant } from "@prisma/client";

const ENC_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "company",
  "street",
  "zip",
  "city",
  "country",
  "notes",
  "invoiceNotes",
  "billingCompany",
  "billingName",
  "billingStreet",
  "billingZipCity",
  "billingEmail",
  "costCenter",
] as const;

type EncField = (typeof ENC_FIELDS)[number];

export function encryptParticipantInput(input: Partial<Record<EncField, string | null | undefined>>) {
  const out: Record<string, string | null> = {};
  for (const k of ENC_FIELDS) {
    if (k in input) out[k] = encryptField(input[k] ?? null);
  }
  if (typeof input.email === "string" && input.email.length > 0) {
    out.emailHash = blindIndex(input.email);
    // emailDomainHash fuer Auto-Tag-Zuordnung. Freemail-Domains (gmail,
    // gmx, web.de, ...) werden explizit ignoriert.
    const at = input.email.indexOf("@");
    if (at >= 0) {
      const dom = input.email.slice(at + 1).trim().toLowerCase();
      const FREE = new Set([
        "gmail.com", "googlemail.com", "yahoo.com", "yahoo.de", "ymail.com",
        "hotmail.com", "hotmail.de", "outlook.com", "outlook.de", "live.com",
        "msn.com", "icloud.com", "me.com", "mac.com", "aol.com",
        "web.de", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "t-online.de",
        "freenet.de", "arcor.de", "mailbox.org", "posteo.de", "proton.me",
        "protonmail.com", "tutanota.com", "tutanota.de",
      ]);
      out.emailDomainHash = dom && !FREE.has(dom) ? blindIndex(dom) : null;
    }
  }
  // companyHash fuer Auto-Tag-Zuordnung pflegen, wenn 'company' im Input ist.
  if ("company" in input) {
    const c = (input.company ?? "").trim();
    if (c.length > 0) {
      const norm = c.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      out.companyHash = norm ? blindIndex(norm) : null;
    } else {
      out.companyHash = null;
    }
  }
  return out;
}

export function decryptParticipant(p: Participant) {
  const out: any = { ...p };
  for (const k of ENC_FIELDS) {
    out[k] = safeDecrypt((p as any)[k]);
  }
  return out as Participant & Record<EncField, string | null>;
}
