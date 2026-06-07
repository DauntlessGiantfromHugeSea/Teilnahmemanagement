import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getBadgeTemplate, BADGE_TEMPLATES } from "@/lib/badgeTemplates";
import { renderBadgePdf, loadLogoBuffer, type BadgeItem } from "@/lib/badgePdf";
import { getOrCreateStaffPortalToken } from "@/lib/staffPortalToken";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const templateId = String(f.get("template") ?? BADGE_TEMPLATES[0].id);
  const tpl = getBadgeTemplate(templateId);
  if (!tpl) return new NextResponse("Unbekannte Vorlage", { status: 400 });

  const staffId = String(f.get("staffId") ?? "").trim();
  const scope = String(f.get("scope") ?? "active");

  // Auswahl: einzelner Mitarbeiter (Reprint-Knopf in der Liste) oder Liste.
  let staff;
  if (staffId) {
    staff = await prisma.staff.findMany({ where: { id: staffId } });
  } else {
    staff = await prisma.staff.findMany({
      where: scope === "all" ? {} : { active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }
  if (staff.length === 0) {
    return new NextResponse("Keine Mitarbeiter zum Drucken vorhanden.", { status: 400 });
  }

  const items: BadgeItem[] = staff.map((m) => ({
    name: `${m.firstName} ${m.lastName}`.trim(),
    company: m.subtitle?.trim() || m.company,
  }));

  const logoUrl = process.env.BADGE_LOGO_URL || process.env.MAIL_LOGO_URL || "";
  const logo = await loadLogoBuffer(logoUrl);
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const token = await getOrCreateStaffPortalToken();
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
