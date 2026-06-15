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
