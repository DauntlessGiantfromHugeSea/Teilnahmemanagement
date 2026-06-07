import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { getBadgeTemplate, BADGE_TEMPLATES } from "@/lib/badgeTemplates";
import { renderBadgePdf, loadLogoBuffer, type BadgeItem } from "@/lib/badgePdf";
import { getOrCreateStaffPortalToken } from "@/lib/staffPortalToken";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const raw = String(f.get("names") ?? "").trim();
  const templateId = String(f.get("template") ?? BADGE_TEMPLATES[0].id);
  const tpl = getBadgeTemplate(templateId);
  if (!tpl) return new NextResponse("Unbekannte Vorlage", { status: 400 });

  // Format pro Zeile: "Vorname Nachname | Position" (Position optional)
  const items: BadgeItem[] = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split("|");
      return {
        name: name.trim(),
        company: rest.join("|").trim() || undefined,
      };
    });

  if (items.length === 0) return new NextResponse("Keine Namen angegeben", { status: 400 });

  const logoUrl = process.env.BADGE_LOGO_URL || process.env.MAIL_LOGO_URL || "";
  const logo = await loadLogoBuffer(logoUrl);
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const token = await getOrCreateStaffPortalToken();
  // QR zeigt auf den Token-geschuetzten Portal-Picker. Damit kommt nicht jeder
  // zufaellig drauf, der die Basis-URL kennt.
  const portalUrl = appUrl ? `${appUrl}/portal/staff/${token}` : undefined;

  const pdf = await renderBadgePdf({
    template: tpl,
    items,
    logoBuffer: logo,
    eventTitle: "Mitarbeiter",
    portalUrl,
    duplexFlip: "long",
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Mitarbeiter_Namensschilder.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
