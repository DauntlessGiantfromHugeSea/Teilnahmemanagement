import nodemailer, { type Transporter } from "nodemailer";
import type { Mailbox } from "@prisma/client";
import { prisma } from "./db";
import { encryptField, safeDecrypt } from "./crypto";

// Verwaltung der ueberwachten Postfaecher.
//
// Zugangsdaten (IMAP- und SMTP-Passwort) liegen mit FIELD_ENCRYPTION_KEY
// verschluesselt in der DB - wie alle anderen sensiblen Felder auch. Sie
// werden nie an den Client ausgeliefert; Formulare zeigen nur "gesetzt" an
// und ein leeres Passwortfeld laesst den bestehenden Wert unveraendert.

export interface MailboxCredentials {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  imapFolder: string;
}

export function mailboxImapCredentials(mb: Mailbox): MailboxCredentials | null {
  const pass = safeDecrypt(mb.imapPass);
  if (!mb.imapHost || !mb.imapUser || !pass) return null;
  return {
    imapHost: mb.imapHost,
    imapPort: mb.imapPort,
    imapSecure: mb.imapSecure,
    imapUser: mb.imapUser,
    imapPass: pass,
    imapFolder: mb.imapFolder || "INBOX",
  };
}

/**
 * SMTP-Transport fuer ein Postfach. Hat das Postfach keine eigenen
 * SMTP-Daten, wird die globale SMTP_*-Konfiguration aus der .env verwendet -
 * dann aber mit der Postfach-Adresse als Absender.
 */
export function mailboxTransport(mb: Mailbox): Transporter | null {
  const host = mb.smtpHost || process.env.SMTP_HOST;
  const user = mb.smtpUser || mb.imapUser || process.env.SMTP_USER;
  const pass = mb.smtpHost
    ? safeDecrypt(mb.smtpPass)
    : safeDecrypt(mb.smtpPass) ?? safeDecrypt(mb.imapPass) ?? process.env.SMTP_PASS ?? null;
  if (!host || !user || !pass) return null;

  const port = mb.smtpPort ?? parseInt(process.env.SMTP_PORT ?? "465", 10);
  const secure = mb.smtpSecure ?? (process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

/** Absenderkopf fuer Antworten aus diesem Postfach. */
export function mailboxFrom(mb: Mailbox): string {
  const name = (mb.fromName || mb.label || "").trim();
  return name ? `${name} <${mb.address}>` : mb.address;
}

export interface MailboxInput {
  address: string;
  label: string;
  fromName?: string | null;
  color?: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass?: string | null; // leer = unveraendert lassen
  imapFolder: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUser?: string | null;
  smtpPass?: string | null; // leer = unveraendert lassen
  active: boolean;
}

export async function createMailbox(input: MailboxInput) {
  if (!input.imapPass) throw new Error("IMAP-Passwort ist beim Anlegen Pflicht.");
  return prisma.mailbox.create({
    data: {
      address: input.address.trim().toLowerCase(),
      label: input.label.trim(),
      fromName: input.fromName?.trim() || null,
      color: input.color?.trim() || null,
      imapHost: input.imapHost.trim(),
      imapPort: input.imapPort,
      imapSecure: input.imapSecure,
      imapUser: input.imapUser.trim(),
      imapPass: encryptField(input.imapPass)!,
      imapFolder: input.imapFolder.trim() || "INBOX",
      smtpHost: input.smtpHost?.trim() || null,
      smtpPort: input.smtpPort ?? null,
      smtpSecure: input.smtpSecure ?? null,
      smtpUser: input.smtpUser?.trim() || null,
      smtpPass: input.smtpPass ? encryptField(input.smtpPass) : null,
      active: input.active,
    },
  });
}

export async function updateMailbox(id: string, input: MailboxInput) {
  return prisma.mailbox.update({
    where: { id },
    data: {
      address: input.address.trim().toLowerCase(),
      label: input.label.trim(),
      fromName: input.fromName?.trim() || null,
      color: input.color?.trim() || null,
      imapHost: input.imapHost.trim(),
      imapPort: input.imapPort,
      imapSecure: input.imapSecure,
      imapUser: input.imapUser.trim(),
      ...(input.imapPass ? { imapPass: encryptField(input.imapPass)! } : {}),
      imapFolder: input.imapFolder.trim() || "INBOX",
      smtpHost: input.smtpHost?.trim() || null,
      smtpPort: input.smtpPort ?? null,
      smtpSecure: input.smtpSecure ?? null,
      smtpUser: input.smtpUser?.trim() || null,
      ...(input.smtpPass ? { smtpPass: encryptField(input.smtpPass) } : {}),
      active: input.active,
    },
  });
}

/** Liest das Postfach-Formular aus der Admin-Oberflaeche. */
export function parseMailboxForm(f: FormData): MailboxInput {
  const smtpPort = String(f.get("smtpPort") ?? "").trim();
  const smtpSecureRaw = String(f.get("smtpSecure") ?? "");
  return {
    address: String(f.get("address") ?? "").trim(),
    label: String(f.get("label") ?? "").trim(),
    fromName: String(f.get("fromName") ?? "").trim() || null,
    color: String(f.get("color") ?? "").trim() || null,
    imapHost: String(f.get("imapHost") ?? "").trim(),
    imapPort: Number(f.get("imapPort") ?? 993) || 993,
    imapSecure: String(f.get("imapSecure") ?? "true") === "true",
    imapUser: String(f.get("imapUser") ?? "").trim(),
    imapPass: String(f.get("imapPass") ?? "").trim() || null,
    imapFolder: String(f.get("imapFolder") ?? "INBOX").trim() || "INBOX",
    smtpHost: String(f.get("smtpHost") ?? "").trim() || null,
    smtpPort: smtpPort ? Number(smtpPort) : null,
    smtpSecure: smtpSecureRaw === "" ? null : smtpSecureRaw === "true",
    smtpUser: String(f.get("smtpUser") ?? "").trim() || null,
    smtpPass: String(f.get("smtpPass") ?? "").trim() || null,
    active: String(f.get("active") ?? "") === "on" || String(f.get("active") ?? "") === "true",
  };
}

/** Sinnvolle Defaults fuer All-Inkl/Kasserver-Postfaecher. */
export function defaultImapHost(): string {
  const smtp = process.env.SMTP_HOST ?? "";
  return smtp || "";
}
