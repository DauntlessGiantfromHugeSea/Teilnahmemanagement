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
  return out;
}

export function decryptParticipant(p: Participant) {
  const out: any = { ...p };
  for (const k of ENC_FIELDS) {
    out[k] = safeDecrypt((p as any)[k]);
  }
  return out as Participant & Record<EncField, string | null>;
}
