import { MailboxProvider, type Mailbox, type Ticket, type User } from "@prisma/client";
import { escapeHtml } from "./email-templates";
import {
  absoluteMailUrl,
  getCompanySignature,
  renderSignatureHtml,
  renderSignatureText,
  type CompanySignature,
} from "./mailSignature";
import { mailboxFrom, mailboxTransport } from "./mailbox";
import { plainToHtml } from "./mailHtml";
import { htmlToText } from "./mailer";
import { subjectWithReference } from "./ticketRef";
import { graphCredentials, graphSendReply } from "./msGraphMail";

// Aufbau und Versand einer Ticket-Antwort.
//
// Jede Antwort traegt die Referenz an zwei Stellen:
//   - im Betreff:  "Re: Frage zur Schulung [FBA-7K2M9-4XQ1P]"
//   - im Footer:   sichtbarer Hinweis, die Nummer beim Antworten stehenzulassen
// Dazu kommen die Header In-Reply-To/References fuer sauberes Threading und
// X-Ticket-Ref als maschinenlesbares Fallback.

export interface ReplyBuildInput {
  ticket: Ticket;
  mailbox: Mailbox;
  bodyText: string;
  user: User;
}

export interface BuiltReply {
  subject: string;
  html: string;
  text: string;
}

function headerBand(accent: string, logoUrl: string, logoWidth: number): string {
  const href = absoluteMailUrl(logoUrl);
  const logo = href
    ? `<img src="${escapeHtml(href)}" alt="" width="${logoWidth}" style="width:${logoWidth}px;height:auto;display:inline-block;">`
    : "";
  return `
  <tr>
    <td style="background:${accent};background-image:linear-gradient(90deg,${accent} 0%,#134e4a 100%);padding:26px 28px;text-align:center;border-radius:14px 14px 0 0;">
      ${logo}
    </td>
  </tr>`;
}

// Die Fusszeile zeigt bewusst die zentralen Firmendaten aus den
// Mail-Einstellungen - nicht das technische Postfach, aus dem gerade
// geantwortet wird.
function footerBlock(company: CompanySignature, reference: string): string {
  const accent = company.accentColor || "#0f766e";
  const parts: string[] = [];
  if (company.footerEmail) {
    parts.push(
      `<a href="mailto:${escapeHtml(company.footerEmail)}" style="color:${accent};text-decoration:none;">${escapeHtml(company.footerEmail)}</a>`
    );
  }
  if (company.footerPhone) {
    parts.push(
      `<a href="tel:${escapeHtml(company.footerPhone.replace(/[^\d+]/g, ""))}" style="color:${accent};text-decoration:none;">${escapeHtml(company.footerPhone)}</a>`
    );
  }
  return `
  <tr>
    <td style="padding:18px 28px 8px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6;">
      <strong style="color:#334155;">${escapeHtml(company.footerName)}</strong>${
        parts.length ? " &middot; " + parts.join(" &middot; ") : ""
      }
    </td>
  </tr>
  <tr>
    <td style="padding:0 28px 22px;font-size:12px;color:#94a3b8;line-height:1.6;">
      Referenz <strong style="color:#475569;letter-spacing:0.04em;">${escapeHtml(reference)}</strong> &middot;
      Bitte lassen Sie diese Nummer beim Antworten stehen, damit wir Ihre Antwort automatisch zuordnen können.
    </td>
  </tr>`;
}

/** Baut Betreff, HTML und Text-Fallback einer Antwort. */
export async function buildReply(input: ReplyBuildInput): Promise<BuiltReply> {
  const company = await getCompanySignature();
  const accent = company.accentColor || "#0f766e";
  const signatureHtml = renderSignatureHtml(input.user, company);
  const signatureText = renderSignatureText(input.user, company);

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      ${headerBand(accent, company.logoUrl, company.logoWidth || 132)}
      <tr>
        <td style="padding:28px 28px 8px;font-size:15px;line-height:1.65;color:#0f172a;">
          ${plainToHtml(input.bodyText)}
          ${signatureHtml}
        </td>
      </tr>
      ${footerBlock(company, input.ticket.reference)}
    </table>
  </div>
</body></html>`;

  const text = [
    input.bodyText.trim(),
    "",
    signatureText,
    "",
    `Referenz ${input.ticket.reference} — bitte beim Antworten stehen lassen.`,
  ]
    .join("\n")
    .trim();

  return { subject: "", html, text };
}

export interface SendReplyInput extends ReplyBuildInput {
  subject: string;
  to: string[];
  cc?: string[];
  inReplyTo?: string | null;
  references?: string | null;
  /** Graph-ID der letzten eingehenden Nachricht (nur Microsoft-365-Postfaecher). */
  replyToGraphId?: string | null;
}

export interface SendReplyResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Verschickt die Antwort - ueber Microsoft Graph bei M365-Postfaechern,
 * sonst ueber das SMTP des Postfachs.
 */
export async function sendTicketReply(input: SendReplyInput): Promise<SendReplyResult> {
  const built = await buildReply(input);
  const subject = subjectWithReference(input.subject, input.ticket.reference);

  if (input.mailbox.provider === MailboxProvider.MS_GRAPH) {
    const creds = graphCredentials(input.mailbox);
    if (!creds) {
      return {
        ok: false,
        error: "Microsoft-Zugangsdaten für dieses Postfach fehlen (Tenant/Client/Secret).",
      };
    }
    try {
      const sent = await graphSendReply({
        mailbox: input.mailbox,
        creds,
        to: input.to,
        cc: input.cc,
        subject,
        html: built.html,
        text: built.text,
        ticketReference: input.ticket.reference,
        replyToGraphId: input.replyToGraphId,
      });
      return { ok: true, messageId: sent.messageId };
    } catch (e) {
      const message = (e as Error).message;
      console.error(`[ticketMail] Graph-Versand fehlgeschlagen (${input.ticket.reference}): ${message}`);
      return { ok: false, error: message };
    }
  }

  const transport = mailboxTransport(input.mailbox);
  if (!transport) {
    return { ok: false, error: "Für dieses Postfach ist kein SMTP-Versand konfiguriert." };
  }

  const headers: Record<string, string> = { "X-Ticket-Ref": input.ticket.reference };
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  if (input.references) headers["References"] = input.references;

  try {
    const info = await transport.sendMail({
      from: mailboxFrom(input.mailbox),
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      replyTo: input.mailbox.address,
      subject,
      html: built.html,
      text: built.text || htmlToText(built.html),
      headers,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const message = (e as Error).message;
    console.error(`[ticketMail] Versand fehlgeschlagen (${input.ticket.reference}): ${message}`);
    return { ok: false, error: message };
  } finally {
    transport.close();
  }
}
