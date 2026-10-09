import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { saveUpload } from "@/lib/uploads";
import { audit } from "@/lib/audit";
import {
  DEFAULT_COMPANY_SIGNATURE,
  getCompanySignature,
  saveCompanySignature,
  type CompanySignature,
} from "@/lib/mailSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Speichert das Mail-Design (Logo, Farbe, Fusszeile, Rechtsangaben,
// Vertraulichkeitshinweis). Gilt fuer alle Ticket-Antworten.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: `/admin/mail-design?${new URLSearchParams(q).toString()}` },
    });

  const f = await req.formData();
  const current = await getCompanySignature();

  // Logo: hochgeladene Datei hat Vorrang vor dem URL-Feld.
  let logoUrl = String(f.get("logoUrl") ?? "").trim();
  const file = f.get("logoFile");
  if (file instanceof File && file.size > 0) {
    try {
      const saved = await saveUpload(file);
      if (!saved) return back({ error: "Logo konnte nicht gespeichert werden (Typ oder Größe)." });
      logoUrl = saved.url;
    } catch (e) {
      return back({ error: (e as Error).message });
    }
  }

  const legalLines = String(f.get("legalLines") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const str = (k: string, fallback: string) => {
    const v = String(f.get(k) ?? "").trim();
    return v || fallback;
  };

  const value: CompanySignature = {
    logoUrl,
    logoWidth: Math.min(400, Math.max(40, Number(f.get("logoWidth") ?? 150) || 150)),
    accentColor: str("accentColor", DEFAULT_COMPANY_SIGNATURE.accentColor),
    footerName: str("footerName", DEFAULT_COMPANY_SIGNATURE.footerName),
    footerEmail: String(f.get("footerEmail") ?? "").trim(),
    footerPhone: String(f.get("footerPhone") ?? "").trim(),
    legalLines: legalLines.length > 0 ? legalLines : current.legalLines,
    disclaimerDe: str("disclaimerDe", DEFAULT_COMPANY_SIGNATURE.disclaimerDe),
    disclaimerEn: str("disclaimerEn", DEFAULT_COMPANY_SIGNATURE.disclaimerEn),
  };

  await saveCompanySignature(value);
  await audit({
    actorId: s.uid,
    action: "MAIL_DESIGN_UPDATE",
    entityType: "AppSetting",
    entityId: "mail.signature.company",
    diff: { logoUrl: value.logoUrl, footerName: value.footerName },
  });

  return back({ ok: "Mail-Design gespeichert." });
}
