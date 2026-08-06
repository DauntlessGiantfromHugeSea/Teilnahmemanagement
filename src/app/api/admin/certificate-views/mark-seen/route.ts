import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";

// POST /api/admin/certificate-views/mark-seen
// Body: leer -> markiert ALLE ungesehenen als gesehen
// Body: JSON { id: "..." } -> markiert einen konkreten Eintrag
// Form-POST (multipart oder urlencoded) mit "id" wird ebenfalls unterstuetzt.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false, error: "Nicht eingeloggt" }, { status: 401 });
  if (!isAdmin(s)) return NextResponse.json({ ok: false, error: "Kein Admin" }, { status: 403 });

  let id: string | null = null;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      id = typeof j?.id === "string" ? j.id : null;
    } else if (ct.length > 0) {
      const f = await req.formData();
      const v = f.get("id");
      id = typeof v === "string" ? v : null;
    }
  } catch {
    /* leerer Body ist ok - dann markieren wir alle */
  }

  const now = new Date();
  if (id) {
    await prisma.certificateView.update({
      where: { id },
      data: { seenAt: now },
    });
  } else {
    await prisma.certificateView.updateMany({
      where: { seenAt: null },
      data: { seenAt: now },
    });
  }

  // Bei Form-Submit zurueck zur Uebersicht redirecten, bei JSON eine JSON-Antwort.
  if (ct.includes("application/json")) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.redirect(new URL("/admin/zertifikat-pruefungen", req.url), 303);
}
