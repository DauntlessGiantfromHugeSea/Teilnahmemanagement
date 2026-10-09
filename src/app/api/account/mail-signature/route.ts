import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getCompanySignature, renderSignatureHtml } from "@/lib/mailSignature";

export const dynamic = "force-dynamic";

// Speichert die persoenliche E-Mail-Signatur (Titel, Name, Kontaktdaten).
// Jeder angemeldete Benutzer pflegt ausschliesslich seine eigene.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });

  const f = await req.formData();
  const str = (k: string) => String(f.get(k) ?? "").trim() || null;
  const preview = String(f.get("preview") ?? "") === "1";

  const data = {
    sigEnabled: String(f.get("sigEnabled") ?? "") === "on",
    sigName: str("sigName"),
    sigTitle: str("sigTitle"),
    sigCompany: str("sigCompany"),
    sigPhone: str("sigPhone"),
    sigMobile: str("sigMobile"),
    sigFax: str("sigFax"),
    sigEmail: str("sigEmail"),
    sigWeb: str("sigWeb"),
    sigAddress: str("sigAddress"),
    sigLinkedIn: str("sigLinkedIn"),
    sigGreeting: str("sigGreeting"),
  };

  // Vorschau rendert nur, ohne zu speichern.
  if (preview) {
    const company = await getCompanySignature();
    const html = renderSignatureHtml(
      { ...data, name: s.name, email: s.email },
      company
    );
    return new NextResponse(
      `<!doctype html><html lang="de"><head><meta charset="utf-8"></head>` +
        `<body style="margin:0;padding:20px;background:#fff;">${html}</body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  await prisma.user.update({ where: { id: s.uid }, data });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/account/signatur?ok=Signatur+gespeichert." },
  });
}
