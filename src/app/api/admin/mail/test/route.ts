import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { sendMail, verifyMailer, isMailingConfigured } from "@/lib/mailer";
import { audit } from "@/lib/audit";

// GET  - liefert nur den Konfigurations-Status (kein Versand).
// POST - body { to: "adresse@..." }: prueft SMTP-Verbindung und sendet
//        eine Testmail. Nur Admins.
export async function GET() {
  const s = await getSession();
  if (!isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  return NextResponse.json({
    configured: isMailingConfigured(),
    host: process.env.SMTP_HOST ?? null,
    port: process.env.SMTP_PORT ?? null,
    user: process.env.SMTP_USER ?? null,
    from: process.env.MAIL_FROM ?? null,
    admin: process.env.MAIL_ADMIN ?? null,
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  let to = "";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as { to?: string };
    to = (j.to ?? "").trim();
  } else {
    const f = await req.formData().catch(() => null);
    to = String(f?.get("to") ?? "").trim();
  }
  if (!to) return NextResponse.json({ ok: false, error: "Empfänger fehlt" }, { status: 400 });

  try {
    await verifyMailer();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stage: "verify", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }

  const r = await sendMail({
    to,
    subject: "Testmail – Teilnahmemanagement",
    text: "Dies ist eine Testmail aus dem Teilnahmemanagement. Wenn Sie diese Mail empfangen, ist der SMTP-Versand korrekt eingerichtet.",
    html: '<p>Dies ist eine Testmail aus dem Teilnahmemanagement.</p><p>Wenn Sie diese Mail empfangen, ist der SMTP-Versand korrekt eingerichtet.</p>',
  });

  await audit({
    actorId: s!.uid,
    action: "MAIL_TEST",
    entityType: "System",
    entityId: "mailer",
    diff: { to, ok: r.ok, error: r.error ?? null },
  });

  if (!r.ok) {
    return NextResponse.json({ ok: false, stage: "send", error: r.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, messageId: r.messageId });
}
