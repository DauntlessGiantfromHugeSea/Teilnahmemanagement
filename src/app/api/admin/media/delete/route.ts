import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { join, normalize } from "node:path";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

function back(params: Record<string, string>): NextResponse {
  const qs = new URLSearchParams(params).toString();
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/media?${qs}` },
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const url = String(f.get("url") ?? "").trim();
  if (!url.startsWith("/uploads/")) {
    return back({ error: "Ungültige URL." });
  }
  // Pfad gegen Traversal sichern
  const rel = url.replace(/^\/uploads\//, "");
  const base = join(process.cwd(), "public", "uploads");
  const target = normalize(join(base, rel));
  if (!target.startsWith(base + "/") && target !== base) {
    return back({ error: "Pfad nicht erlaubt." });
  }
  try {
    await unlink(target);
    await audit({
      actorId: s.uid,
      action: "MEDIA_DELETE",
      entityType: "Media",
      diff: { url },
    });
    return back({ ok: "deleted" });
  } catch (e: any) {
    return back({ error: e?.message ?? "Löschen fehlgeschlagen" });
  }
}
