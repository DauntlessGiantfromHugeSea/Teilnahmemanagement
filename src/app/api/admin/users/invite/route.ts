import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { issueToken } from "@/lib/pwToken";
import { sendMail } from "@/lib/mailer";
import { inviteMail } from "@/lib/mailTemplates";
import { Role } from "@prisma/client";

function back(qs: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/users?${qs}` },
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const name = String(f.get("name") ?? "").trim();
  const role = String(f.get("role") ?? "VIEWER") as Role;

  if (!email || !name) {
    return back(`error=${encodeURIComponent("Name und E-Mail sind Pflicht")}`);
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return back(`error=${encodeURIComponent("E-Mail existiert bereits")}`);
  }

  // Placeholder-Hash, der keinem realen Passwort entspricht.
  // Login schlaegt damit bis zum erfolgreichen set-password fehl.
  const placeholderHash = crypto.randomBytes(48).toString("base64");
  const t = issueToken();

  const u = await prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash: placeholderHash,
      pwTokenHash: t.hash,
      pwTokenExpiresAt: t.expiresAt,
    },
  });

  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const appName = process.env.APP_NAME ?? "FB-Akademie Teilnahmemanagement";
  const link = `${appUrl}/set-password?token=${t.token}`;
  const tmpl = inviteMail({
    recipientName: name,
    link,
    appName,
    expiresAt: t.expiresAt,
    mode: "invite",
  });

  const r = await sendMail({
    to: email,
    subject: tmpl.subject,
    text: tmpl.text,
    html: tmpl.html,
  });

  await audit({
    actorId: s.uid,
    action: "USER_INVITE",
    entityType: "User",
    entityId: u.id,
    diff: { email, role, mailSent: r.ok, mailError: r.error ?? null },
  });

  if (!r.ok && !r.skipped) {
    return back(
      `error=${encodeURIComponent(`Nutzer angelegt, aber Mail nicht zugestellt: ${r.error ?? "unbekannt"}`)}`
    );
  }
  if (r.skipped) {
    return back(`error=${encodeURIComponent("Nutzer angelegt - SMTP ist nicht konfiguriert, bitte Link manuell weitergeben")}&link=${encodeURIComponent(link)}`);
  }
  return back(`ok=${encodeURIComponent(`Einladung an ${email} gesendet`)}`);
}
