import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { saveCertTexts } from "@/lib/kompetenzfelder";

export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  await saveCertTexts({ gfSignatureUrl: "" });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/kompetenzfelder?ok=" + encodeURIComponent("Unterschrift gelöscht.") },
  });
}
