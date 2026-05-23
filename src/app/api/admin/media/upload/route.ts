import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { saveUpload } from "@/lib/uploads";
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
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return back({ error: "Keine Datei ausgewählt." });
  }
  try {
    const saved = await saveUpload(file);
    if (!saved) return back({ error: "Datei konnte nicht gespeichert werden." });
    await audit({
      actorId: s.uid,
      action: "MEDIA_UPLOAD",
      entityType: "Media",
      diff: { url: saved.url, size: saved.size, type: saved.type },
    });
    return back({ ok: "uploaded", url: saved.url });
  } catch (e: any) {
    return back({ error: e?.message ?? "Upload fehlgeschlagen" });
  }
}
