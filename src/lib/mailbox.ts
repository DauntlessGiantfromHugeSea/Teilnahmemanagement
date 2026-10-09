import nodemailer, { type Transporter } from "nodemailer";
import { MailboxProvider, type Mailbox } from "@prisma/client";
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
  if (mb.provider !== MailboxProvider.IMAP) return null;
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
  // Microsoft-365-Postfaecher verschicken ueber Graph, nicht ueber SMTP.
  if (mb.provider !== MailboxProvider.IMAP) return null;
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
  provider: MailboxProvider;
  fromName?: string | null;
  color?: string | null;
  graphTenantId?: string | null;
  graphClientId?: string | null;
  graphClientSecret?: string | null; // leer = unveraendert lassen
  graphFolder?: string | null;
  imapHost?: string | null;
  imapPort: number;
  imapSecure: boolean;
  imapUser?: string | null;
  imapPass?: string | null; // leer = unveraendert lassen
  imapFolder?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUser?: string | null;
  smtpPass?: string | null; // leer = unveraendert lassen
  active: boolean;
}

export async function createMailbox(input: MailboxInput) {
  if (input.provider === MailboxProvider.IMAP && !input.imapPass) {
    throw new Error("IMAP-Passwort ist beim Anlegen Pflicht.");
  }
  return prisma.mailbox.create({
    data: {
      ...commonFields(input),
      ...(input.imapPass ? { imapPass: encryptField(input.imapPass) } : {}),
      ...(input.graphClientSecret ? { graphClientSecret: encryptField(input.graphClientSecret) } : {}),
    },
  });
}

export async function updateMailbox(id: string, input: MailboxInput) {
  return prisma.mailbox.update({
    where: { id },
    data: {
      ...commonFields(input),
      // Leeres Passwortfeld laesst den gespeicherten Wert unveraendert.
      ...(input.imapPass ? { imapPass: encryptField(input.imapPass) } : {}),
      ...(input.graphClientSecret ? { graphClientSecret: encryptField(input.graphClientSecret) } : {}),
    },
  });
}

// Alle Felder ausser den Geheimnissen - die werden nur gesetzt, wenn im
// Formular tatsaechlich etwas eingetragen wurde.
function commonFields(input: MailboxInput) {
  return {
    address: input.address.trim().toLowerCase(),
    label: input.label.trim(),
    provider: input.provider,
    fromName: input.fromName?.trim() || null,
    color: input.color?.trim() || null,
    imapHost: input.imapHost?.trim() || null,
    imapPort: input.imapPort,
    imapSecure: input.imapSecure,
    imapUser: input.imapUser?.trim() || null,
    imapFolder: input.imapFolder?.trim() || "INBOX",
    graphTenantId: input.graphTenantId?.trim() || null,
    graphClientId: input.graphClientId?.trim() || null,
    graphFolder: input.graphFolder?.trim() || "inbox",
    smtpHost: input.smtpHost?.trim() || null,
    smtpPort: input.smtpPort ?? null,
    smtpSecure: input.smtpSecure ?? null,
    smtpUser: input.smtpUser?.trim() || null,
    ...(input.smtpPass ? { smtpPass: encryptField(input.smtpPass) } : {}),
    active: input.active,
  };
}

/** Liest das Postfach-Formular aus der Admin-Oberflaeche. */
export function parseMailboxForm(f: FormData): MailboxInput {
  const smtpPort = String(f.get("smtpPort") ?? "").trim();
  const smtpSecureRaw = String(f.get("smtpSecure") ?? "");
  return {
    address: String(f.get("address") ?? "").trim(),
    label: String(f.get("label") ?? "").trim(),
    provider:
      String(f.get("provider") ?? "") === MailboxProvider.MS_GRAPH
        ? MailboxProvider.MS_GRAPH
        : MailboxProvider.IMAP,
    graphTenantId: String(f.get("graphTenantId") ?? "").trim() || null,
    graphClientId: String(f.get("graphClientId") ?? "").trim() || null,
    graphClientSecret: String(f.get("graphClientSecret") ?? "").trim() || null,
    graphFolder: String(f.get("graphFolder") ?? "inbox").trim() || "inbox",
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
  return process.env.SMTP_HOST ?? "";
}

export const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  IMAP: "IMAP (Benutzer + Passwort)",
  MS_GRAPH: "Microsoft 365 (Graph)",
};
