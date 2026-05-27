import nodemailer, { type Transporter } from "nodemailer";

// Stabiler SMTP-Versand ueber den konfigurierten Mailserver (z. B. kasserver.com).
// Konfiguration via ENV:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false"),
//   SMTP_USER, SMTP_PASS, SMTP_FROM
// Connection-Pooling fuer Newsletter-Versand (viele Mails nacheinander).

let transporter: Transporter | null = null;

export function mailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
  );
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT ?? "465");
  const secure =
    (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")) === "true";
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure, // true fuer 465 (SSL), false fuer 587 (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    // Sanftes Rate-Limit, damit der Mailserver nicht drosselt
    rateDelta: 1000,
    rateLimit: 8,
  });
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  listUnsubscribe?: string; // URL oder <mailto:>; setzt List-Unsubscribe Header
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendMail(input: SendMailInput): Promise<SendResult> {
  if (!mailerConfigured()) {
    return { ok: false, error: "SMTP nicht konfiguriert (SMTP_* ENV fehlt)." };
  }
  try {
    const headers: Record<string, string> = {};
    if (input.listUnsubscribe) {
      headers["List-Unsubscribe"] = `<${input.listUnsubscribe}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      replyTo: input.replyTo,
      headers,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function verifySmtp(): Promise<SendResult> {
  if (!mailerConfigured()) {
    return { ok: false, error: "SMTP nicht konfiguriert (SMTP_* ENV fehlt)." };
  }
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
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
