import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
import { prisma } from "@/lib/db";

function back(q: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/wissenstest?${new URLSearchParams(q).toString()}` },
  });
}

function parseOptions(raw: string): string[] {
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !canWriteGlobal(s)) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const text = String(f.get("text") ?? "").trim();
  const options = parseOptions(String(f.get("options") ?? ""));
  const correctRaw = String(f.get("correctIdx") ?? "").trim();
  const correctIdx = correctRaw ? Number(correctRaw) : null;
  const position = Number(f.get("position") ?? 0) || 0;
  if (!text || options.length < 2) return back({ error: "Frage + mindestens 2 Optionen nötig." });
  await prisma.wissenstestQuestion.create({
    data: { text, options: JSON.stringify(options), correctIdx: correctIdx ?? null, position },
  });
  return back({ ok: "Frage angelegt." });
}
