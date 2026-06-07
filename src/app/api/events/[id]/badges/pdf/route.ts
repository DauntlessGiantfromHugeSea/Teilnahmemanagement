import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canViewEvent } from "@/lib/rbac";
import { decryptParticipant } from "@/lib/participants";
import { getBadgeTemplate, BADGE_TEMPLATES } from "@/lib/badgeTemplates";
import { renderBadgePdf, loadLogoBuffer, type BadgeItem } from "@/lib/badgePdf";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canViewEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const templateId = url.searchParams.get("template") ?? BADGE_TEMPLATES[0].id;
  const tpl = getBadgeTemplate(templateId);
  if (!tpl) return new NextResponse("Unbekannte Vorlage", { status: 400 });

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  // Nur nicht-stornierte Teilnehmer aufs Namensschild
  const dec = ev.participants
    .filter((p) => p.status !== "CANCELLED")
    .map(decryptParticipant)
    .sort((a, b) => {
      const ln = (a.lastName ?? "").localeCompare(b.lastName ?? "", "de");
      if (ln !== 0) return ln;
      return (a.firstName ?? "").localeCompare(b.firstName ?? "", "de");
    });

  const items: BadgeItem[] = dec.map((p) => ({
    name: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || (p.email ?? ""),
    company: p.company ?? undefined,
  }));

  const logoUrl = process.env.BADGE_LOGO_URL || process.env.MAIL_LOGO_URL || "";
  const logo = await loadLogoBuffer(logoUrl);

  // QR-Rueckseite zum Schulungs-Portal (optional per ?qr=0 ausschalten)
  const wantQr = url.searchParams.get("qr") !== "0";
  const flip = url.searchParams.get("flip") === "short" ? "short" : "long";
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const portalUrl = wantQr && appUrl ? `${appUrl}/portal/${ev.id}` : undefined;

  const pdf = await renderBadgePdf({
    template: tpl,
    items,
    logoBuffer: logo,
    eventTitle: ev.title,
    portalUrl,
    duplexFlip: flip,
  });

  const safeTitle = ev.title.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
  const fname = `Namensschilder_${tpl.id}_${safeTitle}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
