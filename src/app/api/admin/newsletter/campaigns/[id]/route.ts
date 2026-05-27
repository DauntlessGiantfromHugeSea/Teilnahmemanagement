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

// Erkennt, ob der Inhalt bereits das Marken-Layout enthaelt (doctype),
// damit beim erneuten Speichern nicht doppelt verschachtelt wird.
function ensureWrapped(content: string): string {
  if (/<!doctype html>/i.test(content)) return content;
  return brandWrap(content, { unsubscribeUrl: "{{unsubscribe}}" });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const existing = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!existing) return new NextResponse("Not found", { status: 404 });
  if (existing.status !== "DRAFT") {
    return seeOther(`/admin/newsletter/campaigns?error=${encodeURIComponent("Nur Entwürfe sind editierbar")}`);
  }

  const f = await req.formData();
  const subject = String(f.get("subject") ?? "").trim();
  const inner = String(f.get("bodyHtml") ?? "").trim();
  const action = String(f.get("action") ?? "draft");
  if (!subject || !inner) {
    return seeOther(`/admin/newsletter/campaigns/${params.id}?error=1`);
  }

  await prisma.campaign.update({
    where: { id: params.id },
    data: {
      subject,
      bodyHtml: ensureWrapped(inner),
      tagFilter: parseTagFilter(String(f.get("tagFilter") ?? "")),
    },
  });
  await audit({ actorId: s.uid, action: "CAMPAIGN_UPDATE", entityType: "Campaign", entityId: params.id });

  if (action === "send") {
    try {
      const r = await sendCampaign(params.id);
      return seeOther(`/admin/newsletter/campaigns?ok=${encodeURIComponent(`Versendet: ${r.sent}, Fehler: ${r.failed}`)}`);
    } catch (e: any) {
      return seeOther(`/admin/newsletter/campaigns?error=${encodeURIComponent(e?.message ?? "Versand fehlgeschlagen")}`);
    }
  }
  return seeOther(`/admin/newsletter/campaigns?ok=${encodeURIComponent("Gespeichert")}`);
}
