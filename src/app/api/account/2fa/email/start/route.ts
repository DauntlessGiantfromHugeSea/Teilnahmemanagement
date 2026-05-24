import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPending, getSession } from "@/lib/session";
import { issueLoginCode } from "@/lib/loginCode";
import { sendMail } from "@/lib/mailer";
import { loginCodeMail } from "@/lib/mailTemplates";
import { audit } from "@/lib/audit";

// Sendet einen Bestaetigungscode an die User-Mail, damit der Nutzer
// E-Mail-2FA aktivieren kann. Funktioniert sowohl mit aktiver Session
// als auch im Pending-Zustand (Erst-Setup nach Passwortlogin).
export async function POST() {
  const session = await getSession();
  const pending = session ? null : await getPending();
  const uid = session?.uid ?? pending?.uid;
  if (!uid) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  const c = issueLoginCode();
  await prisma.user.update({
    where: { id: user.id },
    data: { loginCodeHash: c.hash, loginCodeExpiresAt: c.expiresAt },
  });

  const appName = process.env.APP_NAME ?? "FB-Akademie Teilnahmemanagement";
  const tmpl = loginCodeMail({
    recipientName: user.name,
    code: c.code,
    appName,
    expiresInMinutes: 10,
    purpose: "enable",
  });
  const r = await sendMail({
    to: user.email,
    subject: tmpl.subject,
    text: tmpl.text,
    html: tmpl.html,
  });

  await audit({
    actorId: user.id,
    action: "EMAIL_CODE_SENT",
    entityType: "Auth",
    entityId: user.id,
    diff: { purpose: "enable", mailSent: r.ok, mailError: r.error ?? null },
  });

  const qs = r.ok || r.skipped ? "" : `?error=${encodeURIComponent(`Mail nicht zugestellt: ${r.error ?? "unbekannt"}`)}`;
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/account/2fa/setup-email${qs}` },
  });
}
