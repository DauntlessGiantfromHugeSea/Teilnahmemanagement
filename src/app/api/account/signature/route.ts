import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { bodyTooLarge, deleteUpload, saveUpload } from "@/lib/uploads";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/account?${new URLSearchParams(q).toString()}` },
  });

  if (bodyTooLarge(req)) return back({ error: "Datei zu groß." });

  const f = await req.formData();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return back({ error: "Bitte eine Bilddatei auswählen." });
  }

  const before = await prisma.user.findUnique({
    where: { id: s.uid },
    select: { signatureUrl: true },
  });

  let saved;
  try {
    saved = await saveUpload(file);
  } catch (e) {
    return back({ error: (e as Error).message });
  }
  if (!saved) return back({ error: "Upload fehlgeschlagen." });

  await prisma.user.update({ where: { id: s.uid }, data: { signatureUrl: saved.url } });
  // Ersetzte Datei entfernen, sonst waechst das Verzeichnis unbegrenzt.
  if (before?.signatureUrl && before.signatureUrl !== saved.url) {
    await deleteUpload(before.signatureUrl);
  }
  return back({ ok: "Unterschrift gespeichert." });
}
