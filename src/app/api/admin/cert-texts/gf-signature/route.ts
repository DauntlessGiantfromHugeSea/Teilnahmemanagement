import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { saveUpload } from "@/lib/uploads";
import { saveCertTexts } from "@/lib/kompetenzfelder";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const file = f.get("file");
  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/kompetenzfelder?${new URLSearchParams(q).toString()}` },
  });
  if (!(file instanceof File) || file.size === 0) return back({ error: "Bitte eine Bilddatei auswählen." });
  const saved = await saveUpload(file);
  if (!saved) return back({ error: "Upload fehlgeschlagen." });
  await saveCertTexts({ gfSignatureUrl: saved.url });
  return back({ ok: "Geschäftsführer-Unterschrift gespeichert." });
}
