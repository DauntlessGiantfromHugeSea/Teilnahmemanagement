import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { bodyTooLarge, deleteUpload, saveUpload } from "@/lib/uploads";
import { getCertTexts, saveCertTexts } from "@/lib/kompetenzfelder";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/kompetenzfelder?${new URLSearchParams(q).toString()}` },
  });
  if (bodyTooLarge(req)) return back({ error: "Datei zu groß." });

  const f = await req.formData();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return back({ error: "Bitte eine Bilddatei auswählen." });

  const before = await getCertTexts();
  let saved;
  try {
    saved = await saveUpload(file);
  } catch (e) {
    return back({ error: (e as Error).message });
  }
  if (!saved) return back({ error: "Upload fehlgeschlagen." });
  await saveCertTexts({ gfSignatureUrl: saved.url });
  if (before?.gfSignatureUrl && before.gfSignatureUrl !== saved.url) {
    await deleteUpload(before.gfSignatureUrl);
  }
  return back({ ok: "Geschäftsführer-Unterschrift gespeichert." });
}
