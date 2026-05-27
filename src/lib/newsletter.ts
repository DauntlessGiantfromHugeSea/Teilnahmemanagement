import crypto from "node:crypto";
import { prisma } from "./db";
import { encryptField, safeDecrypt, blindIndex } from "./crypto";
import { sendMail } from "./mailer";
import { optInEmail, welcomeEmail } from "./email-templates";
import type { NewsletterSubscriber } from "@prisma/client";

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function confirmUrl(token: string): string {
  return `${appUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
}
export function unsubscribeUrl(token: string): string {
  return `${appUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

function token(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export interface SubscribeInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  source?: string;
  tags?: string[];
  consentIp?: string | null;
  consentSource?: string | null;
}

export interface SubscribeResult {
  status: "pending" | "already_subscribed" | "reactivated";
  subscriberId: string;
}

// Legt einen Abonnenten an bzw. aktualisiert ihn und startet bei Bedarf
// das Double-Opt-In. Idempotent ueber emailHash.
export async function subscribe(input: SubscribeInput): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Ungültige E-Mail-Adresse");
  }
  const hash = blindIndex(email);
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { emailHash: hash } });

  const tags = input.tags && input.tags.length ? JSON.stringify(input.tags) : undefined;

  if (existing) {
    if (existing.status === "SUBSCRIBED") {
      return { status: "already_subscribed", subscriberId: existing.id };
    }
    // PENDING/UNSUBSCRIBED/BOUNCED -> erneutes Double-Opt-In
    const confirmToken = token();
    const updated = await prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        confirmToken,
        consentAt: new Date(),
        consentIp: input.consentIp ?? existing.consentIp,
        consentSource: input.consentSource ?? existing.consentSource,
        source: input.source ?? existing.source,
        ...(tags ? { tags } : {}),
        firstName: input.firstName ? encryptField(input.firstName) : existing.firstName,
        lastName: input.lastName ? encryptField(input.lastName) : existing.lastName,
        company: input.company ? encryptField(input.company) : existing.company,
      },
    });
    await sendOptIn(updated, confirmToken);
    return { status: "reactivated", subscriberId: updated.id };
  }

  const confirmToken = token();
  const created = await prisma.newsletterSubscriber.create({
    data: {
      email: encryptField(email)!,
      emailHash: hash,
      firstName: input.firstName ? encryptField(input.firstName) : null,
      lastName: input.lastName ? encryptField(input.lastName) : null,
      company: input.company ? encryptField(input.company) : null,
      status: "PENDING",
      source: input.source ?? "manual",
      tags,
      confirmToken,
      unsubscribeToken: token(),
      consentAt: new Date(),
      consentIp: input.consentIp ?? null,
      consentSource: input.consentSource ?? null,
    },
  });
  await sendOptIn(created, confirmToken);
  return { status: "pending", subscriberId: created.id };
}

async function sendOptIn(sub: NewsletterSubscriber, confirmToken: string) {
  const email = safeDecrypt(sub.email);
  if (!email) return;
  const firstName = safeDecrypt(sub.firstName);
  const { subject, html } = optInEmail(confirmUrl(confirmToken), firstName);
  const res = await sendMail({ to: email, subject, html });
  await prisma.emailLog.create({
    data: {
      toHash: sub.emailHash,
      subject,
      kind: "OPTIN",
      status: res.ok ? "SENT" : "FAILED",
      error: res.ok ? null : res.error,
      subscriberId: sub.id,
    },
  });
}

export async function confirm(tokenValue: string): Promise<NewsletterSubscriber | null> {
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { confirmToken: tokenValue } });
  if (!sub) return null;
  const updated = await prisma.newsletterSubscriber.update({
    where: { id: sub.id },
    data: { status: "SUBSCRIBED", confirmedAt: new Date(), confirmToken: null },
  });
  // Willkommensmail (best effort)
  const email = safeDecrypt(updated.email);
  if (email) {
    const { subject, html } = welcomeEmail(unsubscribeUrl(updated.unsubscribeToken), safeDecrypt(updated.firstName));
    const res = await sendMail({
      to: email,
      subject,
      html,
      listUnsubscribe: unsubscribeUrl(updated.unsubscribeToken),
    });
    await prisma.emailLog.create({
      data: {
        toHash: updated.emailHash,
        subject,
        kind: "TRANSACTIONAL",
        status: res.ok ? "SENT" : "FAILED",
        error: res.ok ? null : res.error,
        subscriberId: updated.id,
      },
    });
  }
  return updated;
}

export async function unsubscribe(tokenValue: string): Promise<NewsletterSubscriber | null> {
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: tokenValue } });
  if (!sub) return null;
  return prisma.newsletterSubscriber.update({
    where: { id: sub.id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });
}

// Versendet eine Kampagne an alle passenden SUBSCRIBED-Abonnenten.
// Sequentiell mit Logging; markiert Status fortlaufend.
export async function sendCampaign(campaignId: string): Promise<{ sent: number; failed: number }> {
  const { renderTemplate } = await import("./email-templates");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Kampagne nicht gefunden");
  if (campaign.status === "SENT" || campaign.status === "SENDING") {
    throw new Error("Kampagne wurde bereits versendet");
  }

  const tagFilter: string[] = campaign.tagFilter ? JSON.parse(campaign.tagFilter) : [];
  const recipients = await prisma.newsletterSubscriber.findMany({
    where: { status: "SUBSCRIBED" },
  });
  const filtered = recipients.filter((r) => {
    if (!tagFilter.length) return true;
    const tags: string[] = r.tags ? JSON.parse(r.tags) : [];
    return tagFilter.some((t) => tags.includes(t));
  });

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "SENDING", recipientCount: filtered.length },
  });

  let sent = 0;
  let failed = 0;
  for (const sub of filtered) {
    const email = safeDecrypt(sub.email);
    if (!email) {
      failed++;
      continue;
    }
    const unsubUrl = unsubscribeUrl(sub.unsubscribeToken);
    const html = renderTemplate(campaign.bodyHtml, {
      firstName: safeDecrypt(sub.firstName),
      lastName: safeDecrypt(sub.lastName),
      unsubscribeUrl: unsubUrl,
    });
    const res = await sendMail({
      to: email,
      subject: campaign.subject,
      html,
      text: campaign.bodyText ?? undefined,
      listUnsubscribe: unsubUrl,
    });
    if (res.ok) sent++;
    else failed++;
    await prisma.emailLog.create({
      data: {
        toHash: sub.emailHash,
        subject: campaign.subject,
        kind: "CAMPAIGN",
        status: res.ok ? "SENT" : "FAILED",
        error: res.ok ? null : res.error,
        campaignId: campaign.id,
        subscriberId: sub.id,
      },
    });
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: failed > 0 && sent === 0 ? "FAILED" : "SENT",
      sentAt: new Date(),
      sentCount: sent,
      failedCount: failed,
    },
  });
  return { sent, failed };
}

export function decryptSubscriber(s: NewsletterSubscriber) {
  return {
    ...s,
    email: safeDecrypt(s.email),
    firstName: safeDecrypt(s.firstName),
    lastName: safeDecrypt(s.lastName),
    company: safeDecrypt(s.company),
    tagList: s.tags ? (JSON.parse(s.tags) as string[]) : [],
  };
}
