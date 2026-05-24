import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { issueToken } from "@/lib/pwToken";
import { sendMail } from "@/lib/mailer";
import { inviteMail } from "@/lib/mailTemplates";

function back(qs: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/users?${qs}` },
  });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u) return back(`error=${encodeURIComponent("Nutzer nicht gefunden")}`);

  const t = issueToken();
  await prisma.user.update({
    where: { id: u.id },
    data: { pwTokenHash: t.hash, pwTokenExpiresAt: t.expiresAt },
  });

  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const appName = process.env.APP_NAME ?? "FB-Akademie Teilnahmemanagement";
  const link = `${appUrl}/set-password?token=${t.token}`;
  const tmpl = inviteMail({
    recipientName: u.name,
    link,
    appName,
    expiresAt: t.expiresAt,
    mode: "reset",
  });

  const r = await sendMail({
    to: u.email,
    subject: tmpl.subject,
    text: tmpl.text,
    html: tmpl.html,
  });

  await audit({
    actorId: s.uid,
    action: "USER_RESET_LINK",
    entityType: "User",
    entityId: u.id,
    diff: { mailSent: r.ok, mailError: r.error ?? null },
  });

  if (r.skipped) {
    return back(`error=${encodeURIComponent("Link erzeugt - SMTP ist nicht konfiguriert, bitte manuell weitergeben")}&link=${encodeURIComponent(link)}`);
  }
  if (!r.ok) {
    return back(`error=${encodeURIComponent(`Mail nicht zugestellt: ${r.error ?? "unbekannt"}`)}`);
  }
  return back(`ok=${encodeURIComponent(`Reset-Link an ${u.email} gesendet`)}`);
}
