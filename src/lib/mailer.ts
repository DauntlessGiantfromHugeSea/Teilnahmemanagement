import nodemailer, { type Transporter } from "nodemailer";

// Stabiles SMTP-Setup mit Connection-Pool, Retry-Logik und List-Unsubscribe.
//
// Konfiguration ueber Environment-Variablen:
//   SMTP_HOST           z.B. w020deb9.kasserver.com
//   SMTP_PORT           465 (SSL) oder 587 (STARTTLS) - Default: 465
//   SMTP_SECURE         "true" fuer SSL (465), "false" fuer STARTTLS (587).
//                       Wird aus dem Port abgeleitet, wenn nicht gesetzt.
//   SMTP_USER           Postfach-Username
//   SMTP_PASS           Postfach-Passwort
//   MAIL_FROM           Absender (Fallback: SMTP_FROM fuer Abwaertskompat.)
//   MAIL_REPLY_TO       Optionaler Reply-To-Header
//   MAIL_ADMIN          Optionale Empfaengeradresse fuer Admin-Benachrichtigungen
//
// Ohne SMTP-Konfiguration werden Mails uebersprungen und nur geloggt - die App
// bleibt damit auch ohne Mailing voll funktionsfaehig.

export interface MailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  bcc?: string | string[];
  listUnsubscribe?: string; // URL oder <mailto:>; setzt List-Unsubscribe Header
  attachments?: MailAttachment[];
}

// Abwaertskompatibler Alias fuer aelteren Newsletter-Code.
export type SendMailInput = MailOptions;

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

function mailFrom(): string | undefined {
  return process.env.MAIL_FROM ?? process.env.SMTP_FROM ?? undefined;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigKey = "";

function configKey(): string {
  return [
    process.env.SMTP_HOST ?? "",
    process.env.SMTP_PORT ?? "",
    process.env.SMTP_SECURE ?? "",
    process.env.SMTP_USER ?? "",
    process.env.SMTP_PASS ?? "",
  ].join("|");
}

export function isMailingConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      mailFrom()
  );
}

// Alias fuer aelteren Newsletter-Code.
export const mailerConfigured = isMailingConfigured;

function getTransporter(): Transporter | null {
  if (!isMailingConfigured()) return null;
  const key = configKey();
  if (cachedTransporter && key === cachedConfigKey) return cachedTransporter;

  const port = parseInt(process.env.SMTP_PORT ?? "465", 10);
  const secureEnv = process.env.SMTP_SECURE;
  const secure =
    secureEnv === "true" ? true : secureEnv === "false" ? false : port === 465;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    // Sanftes Rate-Limit fuer Newsletter-Versand (viele Mails nacheinander).
    rateDelta: 1000,
    rateLimit: 8,
  });
  cachedConfigKey = key;
  return cachedTransporter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const RETRYABLE_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNECTION",
  "ECONNRESET",
  "ESOCKET",
  "EDNS",
  "EAI_AGAIN",
]);

function isRetryable(err: any): boolean {
  if (!err) return false;
  if (RETRYABLE_ERRORS.has(err.code)) return true;
  // SMTP 4xx = voruebergehend, 5xx = endgueltig
  if (typeof err.responseCode === "number" && err.responseCode >= 400 && err.responseCode < 500) {
    return true;
  }
  return false;
}

/**
 * Versendet eine E-Mail. Schlaegt nie hart fehl - gibt stattdessen
 * { ok:false, error } bzw. { ok:false, skipped:true } zurueck, damit Aufrufer
 * den eigentlichen Vorgang (z. B. Anmeldung) auch ohne Mail abschliessen koennen.
 */
export async function sendMail(opts: MailOptions): Promise<SendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      "[mailer] SMTP nicht konfiguriert - überspringe Mail an",
      Array.isArray(opts.to) ? opts.to.join(",") : opts.to
    );
    return { ok: false, skipped: true };
  }

  const replyTo = opts.replyTo ?? process.env.MAIL_REPLY_TO ?? undefined;
  const headers: Record<string, string> = {};
  if (opts.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${opts.listUnsubscribe}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const message = {
    from: mailFrom(),
    to: opts.to,
    subject: opts.subject,
    text: opts.text ?? (opts.html ? htmlToText(opts.html) : undefined),
    html: opts.html,
    replyTo,
    bcc: opts.bcc,
    headers,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
      contentType: a.contentType,
    })),
  };

  const delays = [0, 2_000, 5_000]; // 3 Versuche
  let lastErr: any = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    try {
      const info = await transporter.sendMail(message);
      return { ok: true, messageId: info.messageId };
    } catch (e: any) {
      lastErr = e;
      const recoverable = isRetryable(e);
      console.error(
        `[mailer] Versand-Fehler (Versuch ${i + 1}/${delays.length}, retry=${recoverable}): ${
          e?.code ?? ""
        } ${e?.message ?? e}`
      );
      if (!recoverable) break;
    }
  }
  return { ok: false, error: lastErr?.message ?? String(lastErr) };
}

/**
 * Prueft die SMTP-Konfiguration durch einen Verbindungs- und Auth-Test.
 * Wirft eine Exception bei Fehlern.
 */
export async function verifyMailer(): Promise<void> {
  const t = getTransporter();
  if (!t) throw new Error("SMTP nicht konfiguriert (SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM fehlen)");
  await t.verify();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
