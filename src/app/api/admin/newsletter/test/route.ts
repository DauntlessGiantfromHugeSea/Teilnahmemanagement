import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { seeOther } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { brandWrap } from "@/lib/email-templates";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const to = String(f.get("to") ?? "").trim();
  if (!to || !to.includes("@")) {
    return seeOther(`/admin/newsletter?error=${encodeURIComponent("Ungültige Zieladresse")}`);
  }
  const html = brandWrap(`
    <h1 style="font-size:20px;margin:0 0 12px;">SMTP-Test erfolgreich</h1>
    <p style="line-height:1.6;">Diese Test-E-Mail wurde erfolgreich über den konfigurierten
    Mailserver versendet. Dein Newsletter-Versand ist einsatzbereit.</p>
  `);
  const res = await sendMail({ to, subject: "SMTP-Test – FB-Akademie Newsletter", html });
  if (!res.ok) {
    return seeOther(`/admin/newsletter?error=${encodeURIComponent("Versand fehlgeschlagen: " + (res.error ?? ""))}`);
  }
  return seeOther("/admin/newsletter?ok=test");
}
