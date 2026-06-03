import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createOtp, emailHashOf } from "@/lib/certPortal";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !EMAIL_RE.test(email)) {
    return redir({ error: "Bitte eine gültige E-Mail-Adresse eingeben." });
  }
  if (!isMailingConfigured()) {
    return redir({ error: "Mailversand ist gerade nicht möglich. Bitte später erneut versuchen." });
  }

  const emailHash = emailHashOf(email);
  const participant = await prisma.participant.findFirst({ where: { emailHash } });

  // Wir geben immer denselben "Wir haben einen Code geschickt"-Hinweis aus,
  // unabhaengig davon, ob die Adresse existiert (Datenschutz).
  if (participant) {
    const { code } = await createOtp(email);
    const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
    const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihr Anmelde-Code</h1>
<p style="margin:0 0 12px 0;">Bitte geben Sie diesen 6-stelligen Code im Zertifikats-Portal ein:</p>
<p style="margin:18px 0;text-align:center;">
  <span style="display:inline-block;font-family:monospace;font-size:28px;letter-spacing:4px;background:#f0fdfa;color:#0f766e;padding:14px 24px;border-radius:10px;font-weight:700;">${code}</span>
</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">Der Code ist 10 Minuten gültig. Falls Sie das nicht angefordert haben, können Sie diese Mail ignorieren.</p>
`;
    const text = [
      `Ihr Code zur Anmeldung im Zertifikats-Portal:`,
      ``,
      `   ${code}`,
      ``,
      `Der Code ist 10 Minuten gültig.`,
    ].join("\n");
    await sendMail({
      to: email,
      subject: `Ihr Code: ${code} – Zertifikats-Portal`,
      text,
      html: htmlShell(appName, inner),
    });
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/meine-zertifikate/code?email=${encodeURIComponent(email)}` },
  });
}

function redir(q: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/meine-zertifikate?${new URLSearchParams(q).toString()}` },
  });
}
