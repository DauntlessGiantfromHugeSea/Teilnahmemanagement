import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptField, blindIndex } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { splitName, cleanPhone } from "@/lib/csvImport";
import { sendMail } from "@/lib/mailer";
import { confirmationMail, adminNotificationMail } from "@/lib/mailTemplates";
import type { DayOption, Prisma } from "@prisma/client";

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // Turnstile nicht konfiguriert -> nur Honeypot
  if (!token) return false;
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    const r = await fetch(TURNSTILE_VERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return false;
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}

function back(eventId: string, err: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/anmeldung/${eventId}?error=${err}` },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { _count: { select: { participants: true } } },
  });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const f = await req.formData();

  // 1) Honeypot: echte Nutzer füllen das versteckte Feld nicht aus
  const honey = String(f.get("website") ?? "").trim();
  if (honey !== "") {
    // Lautlos als Erfolg behandeln, damit Bots keinen Hinweis bekommen
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/anmeldung/${ev.id}/danke` },
    });
  }

  // 2) Mindest-Verweildauer (Bots submitten oft binnen Millisekunden)
  const ts = parseInt(String(f.get("ts") ?? ""), 10);
  if (Number.isFinite(ts)) {
    const dt = Date.now() - ts;
    if (dt < 2000) return back(ev.id, "captcha");
  }

  // 3) Cloudflare Turnstile
  const token = String(f.get("cf-turnstile-response") ?? "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await verifyTurnstile(token, ip))) {
    return back(ev.id, "captcha");
  }

  // 4) Pflichtfelder
  const name = String(f.get("name") ?? "").trim();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const company = String(f.get("company") ?? "").trim();
  const dp = String(f.get("dataProtection") ?? "");
  if (!name || !email || !company || dp !== "on") return back(ev.id, "missing");

  // 5) Kapazität
  if (ev.capacity != null && ev._count.participants >= ev.capacity) {
    return back(ev.id, "full");
  }

  // 6) Dedupe: gleicher Event + gleiche Mail
  const emailHash = blindIndex(email);
  const dup = await prisma.participant.findFirst({
    where: { eventId: ev.id, emailHash },
  });
  if (dup) return back(ev.id, "duplicate");

  // dayOption: Default je nach Event
  let dayOption: DayOption = ev.day2Date ? "BOTH" : "DAY_1";
  const dayChoice = String(f.get("dayOption") ?? "");
  if (dayChoice === "DAY_1" || dayChoice === "DAY_2" || dayChoice === "BOTH") {
    dayOption = dayChoice;
  }
  if (!ev.day2Date && dayOption !== "DAY_1") dayOption = "DAY_1";

  const { firstName, lastName } = splitName(name);
  const phone = cleanPhone(String(f.get("phone") ?? ""));
  const street = String(f.get("street") ?? "").trim();
  const zip = String(f.get("zip") ?? "").trim();
  const city = String(f.get("city") ?? "").trim();
  const billingEmail = String(f.get("billingEmail") ?? "").trim();
  const costCenter = String(f.get("costCenter") ?? "").trim();

  const data: Prisma.ParticipantUncheckedCreateInput = {
    eventId: ev.id,
    firstName: encryptField(firstName) ?? "",
    lastName: encryptField(lastName) ?? "",
    email: encryptField(email) ?? "",
    emailHash,
    phone: encryptField(phone || null),
    company: encryptField(company || null),
    street: encryptField(street || null),
    zip: encryptField(zip || null),
    city: encryptField(city || null),
    billingEmail: encryptField(billingEmail || null),
    costCenter: encryptField(costCenter || null),
    dayOption,
  };

  const p = await prisma.participant.create({ data });

  // Audit-Eintrag über den aeltesten Admin als Actor
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  await audit({
    actorId: admin?.id,
    action: "PUBLIC_ANMELDUNG",
    entityType: "Participant",
    entityId: p.id,
    participantId: p.id,
    diff: { source: "public-form", eventId: ev.id, dayOption },
  });

  // Mailing - blockiert die Antwort nicht. Fehler werden geloggt.
  const appName = process.env.APP_NAME ?? "FB-Akademie Teilnahmemanagement";
  const appUrl = process.env.APP_URL ?? "";
  const participantName = `${firstName} ${lastName}`.trim() || name;
  const conf = confirmationMail({
    event: ev,
    participantName,
    participantEmail: email,
    dayOption,
    appName,
    appUrl,
  });
  void sendMail({
    to: email,
    subject: conf.subject,
    text: conf.text,
    html: conf.html,
  }).catch((e) => console.error("[anmeldung] Bestätigungsmail fehlgeschlagen:", e));

  const adminTo = process.env.MAIL_ADMIN?.trim();
  if (adminTo) {
    const note = adminNotificationMail({
      event: ev,
      participantName,
      participantEmail: email,
      company,
      dayOption,
      appUrl,
      participantId: p.id,
      eventId: ev.id,
    });
    void sendMail({
      to: adminTo.split(",").map((s) => s.trim()).filter(Boolean),
      subject: note.subject,
      text: note.text,
      html: note.html,
      replyTo: email,
    }).catch((e) => console.error("[anmeldung] Admin-Mail fehlgeschlagen:", e));
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/anmeldung/${ev.id}/danke` },
  });
}
