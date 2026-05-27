import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { seeOther } from "@/lib/http";
import { brandWrap } from "@/lib/email-templates";
import { sendCampaign } from "@/lib/newsletter";
import { audit } from "@/lib/audit";

function parseTagFilter(v: string): string | null {
  const tags = v.split(",").map((t) => t.trim()).filter(Boolean);
  return tags.length ? JSON.stringify(tags) : null;
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const subject = String(f.get("subject") ?? "").trim();
  const inner = String(f.get("bodyHtml") ?? "").trim();
  const action = String(f.get("action") ?? "draft");
  if (!subject || !inner) {
    return seeOther(`/admin/newsletter/campaigns?error=${encodeURIComponent("Betreff und Inhalt sind Pflicht")}`);
  }
  // Inhalt ins Marken-Layout einbetten; {{unsubscribe}} bleibt Platzhalter
  const bodyHtml = brandWrap(inner, { unsubscribeUrl: "{{unsubscribe}}" });

  const campaign = await prisma.campaign.create({
    data: {
      subject,
      bodyHtml,
      tagFilter: parseTagFilter(String(f.get("tagFilter") ?? "")),
      status: "DRAFT",
      createdById: s.uid,
    },
  });
  await audit({ actorId: s.uid, action: "CAMPAIGN_CREATE", entityType: "Campaign", entityId: campaign.id });

  if (action === "send") {
    try {
      const r = await sendCampaign(campaign.id);
      return seeOther(`/admin/newsletter/campaigns?ok=${encodeURIComponent(`Versendet: ${r.sent}, Fehler: ${r.failed}`)}`);
    } catch (e: any) {
      return seeOther(`/admin/newsletter/campaigns?error=${encodeURIComponent(e?.message ?? "Versand fehlgeschlagen")}`);
    }
  }
  return seeOther(`/admin/newsletter/campaigns?ok=${encodeURIComponent("Entwurf gespeichert")}`);
}
