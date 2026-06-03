import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { saveCertTexts } from "@/lib/kompetenzfelder";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const str = (k: string) => String(f.get(k) ?? "").trim();
  const months = parseInt(str("validityMonths"), 10);
  await saveCertTexts({
    title: str("title"),
    tnTitle: str("tnTitle"),
    subtitle: str("subtitle"),
    herrnFrauLabel: str("herrnFrauLabel"),
    geschaeftsfuehrer: str("geschaeftsfuehrer"),
    geschaeftsfuehrerRole: str("geschaeftsfuehrerRole"),
    validityMonths: Number.isFinite(months) && months > 0 ? months : 24,
    normLine: str("normLine"),
    normLineForIds: str("normLineForIds").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
    bewertungLine: str("bewertungLine"),
    validityLine: str("validityLine"),
    leipzigDateLabel: str("leipzigDateLabel"),
    tnDefaultBody: str("tnDefaultBody"),
  });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/kompetenzfelder?ok=" + encodeURIComponent("Allgemeine Texte gespeichert.") },
  });
}
