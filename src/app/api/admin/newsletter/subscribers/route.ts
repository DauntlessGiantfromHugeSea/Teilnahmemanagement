import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { seeOther } from "@/lib/http";
import { encryptField, blindIndex } from "@/lib/crypto";
import { subscribe } from "@/lib/newsletter";
import { audit } from "@/lib/audit";
import crypto from "node:crypto";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const firstName = String(f.get("firstName") ?? "").trim();
  const lastName = String(f.get("lastName") ?? "").trim();
  const tags = String(f.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const doubleOptIn = f.get("doubleOptIn") === "on";

  if (!email || !email.includes("@")) {
    return seeOther(`/admin/newsletter?error=${encodeURIComponent("Ungültige E-Mail")}`);
  }

  try {
    if (doubleOptIn) {
      await subscribe({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        source: "manual",
        tags,
      });
    } else {
      // Direkt aktiv setzen (Admin bestaetigt Einwilligung)
      const hash = blindIndex(email);
      const existing = await prisma.newsletterSubscriber.findUnique({ where: { emailHash: hash } });
      if (existing) {
        await prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            status: "SUBSCRIBED",
            confirmedAt: existing.confirmedAt ?? new Date(),
            firstName: firstName ? encryptField(firstName) : existing.firstName,
            lastName: lastName ? encryptField(lastName) : existing.lastName,
            tags: tags.length ? JSON.stringify(tags) : existing.tags,
          },
        });
      } else {
        await prisma.newsletterSubscriber.create({
          data: {
            email: encryptField(email)!,
            emailHash: hash,
            firstName: firstName ? encryptField(firstName) : null,
            lastName: lastName ? encryptField(lastName) : null,
            status: "SUBSCRIBED",
            source: "manual",
            tags: tags.length ? JSON.stringify(tags) : null,
            unsubscribeToken: crypto.randomBytes(24).toString("base64url"),
            consentAt: new Date(),
            confirmedAt: new Date(),
          },
        });
      }
    }
    await audit({ actorId: s.uid, action: "NEWSLETTER_ADD", entityType: "NewsletterSubscriber", entityId: null });
    return seeOther("/admin/newsletter?ok=1");
  } catch (e: any) {
    return seeOther(`/admin/newsletter?error=${encodeURIComponent(e?.message ?? "Fehler")}`);
  }
}
