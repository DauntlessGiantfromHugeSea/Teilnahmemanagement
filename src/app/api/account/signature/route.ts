import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/uploads";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const f = await req.formData();
  const file = f.get("file");

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/account?${new URLSearchParams(q).toString()}` },
  });

  if (!(file instanceof File) || file.size === 0) {
    return back({ error: "Bitte eine Bilddatei auswählen." });
  }
  const saved = await saveUpload(file);
  if (!saved) return back({ error: "Upload fehlgeschlagen." });

  await prisma.user.update({ where: { id: s.uid }, data: { signatureUrl: saved.url } });
  return back({ ok: "Unterschrift gespeichert." });
}
