import nodemailer, { type Transporter } from "nodemailer";
import { graphEnvCredentials, graphSendMail } from "./msGraphMail";

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
// Zweiter Versandweg: Microsoft Graph (App-Only), gesteuert ueber
//   MAIL_TRANSPORT      "graph" | "smtp" | "auto" (Default: auto)
//   MAIL_GRAPH_SENDER   Postfach, aus dem verschickt wird, z.B. info@fb-akademie.de
//   MAIL_GRAPH_SAVE_SENT "false" legt die Kopie NICHT in "Gesendete Elemente"
// "auto" nimmt Graph, sobald Absender und MS_*-Zugangsdaten vorhanden sind,
// sonst SMTP.
//
// Einschraenkung von Graph: internetMessageHeaders erlaubt nur Namen mit dem
// Praefix "x-". List-Unsubscribe laesst sich darueber NICHT setzen; betroffene
// Mails werden trotzdem verschickt, der Wegfall wird protokolliert.
//
// Ohne jede Konfiguration werden Mails uebersprungen und nur geloggt - die App
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

export type MailTransportKind = "graph" | "smtp" | "none";

function graphSender(): string | undefined {
  const explicit = process.env.MAIL_GRAPH_SENDER?.trim();
  if (explicit) return explicit;
  // Rueckfall: die Adresse aus MAIL_FROM, falls dort eine steht.
  const m = /<([^>]+)>/.exec(mailFrom() ?? "");
  const bare = (mailFrom() ?? "").trim();
  const addr = m ? m[1].trim() : bare.includes("@") && !bare.includes(" ") ? bare : "";
  return addr || undefined;
}

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && mailFrom()
  );
}

function graphConfigured(): boolean {
  return Boolean(graphEnvCredentials() && graphSender());
}

/** Welcher Weg wuerde aktuell benutzt? Auch fuer die Diagnose im Admin-Bereich. */
export function mailTransportKind(): MailTransportKind {
  const wanted = (process.env.MAIL_TRANSPORT ?? "auto").toLowerCase();
  if (wanted === "graph") return graphConfigured() ? "graph" : "none";
  if (wanted === "smtp") return smtpConfigured() ? "smtp" : "none";
  if (graphConfigured()) return "graph";
  if (smtpConfigured()) return "smtp";
  return "none";
}

export function isMailingConfigured(): boolean {
  return mailTransportKind() !== "none";
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

/** Zerlegt MAIL_FROM in Anzeigename und Adresse. */
function parseFrom(value: string | undefined): { name?: string; address?: string } {
  const v = (value ?? "").trim();
  if (!v) return {};
  const m = /^(.*?)\s*<([^>]+)>$/.exec(v);
  if (m) return { name: m[1].replace(/^"|"$/g, "").trim() || undefined, address: m[2].trim() };
  return v.includes("@") ? { address: v } : {};
}

let listUnsubscribeWarned = false;

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

/** Versand ueber Microsoft Graph. Siehe Kopfkommentar zu den Einschraenkungen. */
async function sendViaGraph(opts: MailOptions): Promise<SendResult> {
  const sender = graphSender();
  if (!sender) return { ok: false, error: "MAIL_GRAPH_SENDER ist nicht gesetzt." };

  const from = parseFrom(mailFrom());
  const headers: Record<string, string> = {};
  if (opts.listUnsubscribe) {
    // Graph nimmt nur x-Header an. Der Standard-Header geht verloren; das
    // einmal deutlich melden, statt es stillschweigend zu schlucken.
    if (!listUnsubscribeWarned) {
      console.warn(
        "[mailer] Graph-Versand kann List-Unsubscribe nicht setzen - " +
          "der Ein-Klick-Abmeldeknopf in Gmail/Outlook entfällt. " +
          "Für Newsletter MAIL_TRANSPORT=smtp verwenden."
      );
      listUnsubscribeWarned = true;
    }
  }

  const res = await graphSendMail(sender, {
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? (opts.html ? htmlToText(opts.html) : undefined),
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    cc: undefined,
    bcc: opts.bcc ? (Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc]) : undefined,
    replyTo: opts.replyTo ?? process.env.MAIL_REPLY_TO ?? undefined,
    // Der Absender ist immer das Postfach hinter MAIL_GRAPH_SENDER; ein
    // abweichender Anzeigename aus MAIL_FROM wird uebernommen.
    fromName: from.name,
    fromAddress: from.address && from.address.toLowerCase() === sender.toLowerCase() ? from.address : undefined,
    headers,
    attachments: opts.attachments,
  });

  if (!res.ok) {
    console.error(`[mailer] Graph-Versand fehlgeschlagen: ${res.error}`);
    return { ok: false, error: res.error };
  }
  return { ok: true };
}

/**
 * Versendet eine E-Mail. Schlaegt nie hart fehl - gibt stattdessen
 * { ok:false, error } bzw. { ok:false, skipped:true } zurueck, damit Aufrufer
 * den eigentlichen Vorgang (z. B. Anmeldung) auch ohne Mail abschliessen koennen.
 */
export async function sendMail(opts: MailOptions): Promise<SendResult> {
  const kind = mailTransportKind();

  if (kind === "none") {
    console.warn(
      "[mailer] Kein Versandweg konfiguriert (weder Graph noch SMTP) - überspringe Mail an",
      Array.isArray(opts.to) ? opts.to.join(",") : opts.to
    );
    return { ok: false, skipped: true };
  }

  if (kind === "graph") return sendViaGraph(opts);

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
  const kind = mailTransportKind();
  if (kind === "graph") {
    const creds = graphEnvCredentials();
    if (!creds) throw new Error("Microsoft-Zugangsdaten fehlen (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET)");
    if (!graphSender()) throw new Error("MAIL_GRAPH_SENDER ist nicht gesetzt");
    // Token holen genuegt als Nachweis, dass Tenant, App und Secret stimmen.
    const { graphToken } = await import("./msGraphMail");
    await graphToken(creds);
    return;
  }
  const t = getTransporter();
  if (!t) throw new Error("Kein Versandweg konfiguriert (weder MS_*/MAIL_GRAPH_SENDER noch SMTP_*)");
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
