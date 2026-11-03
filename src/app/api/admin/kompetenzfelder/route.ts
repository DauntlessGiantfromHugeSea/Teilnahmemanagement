import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { parseKompetenzfelderForm, saveKompetenzfelder } from "@/lib/kompetenzfelder";
import { audit } from "@/lib/audit";

// Speichert die Kompetenzfelder.
//
// Das Formular liefert immer eine Zeile mehr als vorhanden - die letzte ist
// der Platz fuer ein neues Feld. Die eigentliche Auswertung steckt in
// parseKompetenzfelderForm (src/lib/kompetenzfelder.ts) und ist dort ohne
// Next.js pruefbar.

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const count = Number(f.get("count") ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return back({ error: "Keine Felder übermittelt." });
  }

  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(f.get(`id_${i}`) ?? ""),
    label: String(f.get(`label_${i}`) ?? ""),
    text: String(f.get(`text_${i}`) ?? ""),
  }));
  const deleteId = String(f.get("deleteId") ?? "").trim();

  const parsed = parseKompetenzfelderForm(rows, deleteId);
  if ("error" in parsed) return back({ error: parsed.error });

  await saveKompetenzfelder(parsed.items);

  await audit({
    actorId: s.uid,
    action: deleteId ? "KOMPETENZFELD_DELETE" : "KOMPETENZFELD_SAVE",
    entityType: "AppSetting",
    entityId: "certKompetenzfelder",
    diff: { count: parsed.items.length, deleted: deleteId || undefined },
  });

  if (deleteId) {
    return back({
      ok: `Kompetenzfeld „${deleteId}" entfernt. Bereits ausgestellte Zertifikate bleiben unverändert.`,
    });
  }
  return back({ ok: `Gespeichert — ${parsed.items.length} Kompetenzfelder.` });
}

function back(q: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/kompetenzfelder?${new URLSearchParams(q).toString()}` },
  });
}
