import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { saveKompetenzfelder } from "@/lib/kompetenzfelder";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const count = Number(f.get("count") ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return back({ error: "Keine Felder übermittelt." });
  }
  const items: { id: string; label: string; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    const id = String(f.get(`id_${i}`) ?? "").trim();
    const label = String(f.get(`label_${i}`) ?? "").trim();
    const text = String(f.get(`text_${i}`) ?? "").trim();
    if (!id || !label || !text) {
      return back({ error: `Feld ${i + 1}: ID, Bezeichnung und Text sind Pflicht.` });
    }
    items.push({ id, label, text });
  }
  await saveKompetenzfelder(items);
  return back({ ok: "Gespeichert." });
}

function back(q: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/kompetenzfelder?${new URLSearchParams(q).toString()}` },
  });
}
