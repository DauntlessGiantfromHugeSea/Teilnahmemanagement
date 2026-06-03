import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { importFromCsv } from "@/lib/certificateImport";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const zFile = f.get("zertifikate");
  const tnFile = f.get("teilnahme");

  const zText = zFile instanceof File && zFile.size > 0 ? await zFile.text() : undefined;
  const tnText = tnFile instanceof File && tnFile.size > 0 ? await tnFile.text() : undefined;

  if (!zText && !tnText) {
    return redir({ error: "Keine Datei hochgeladen." });
  }

  try {
    const r = await importFromCsv({
      zertifikateCsv: zText,
      teilnahmebescheinigungenCsv: tnText,
      createdById: s.uid,
    });
    const detail = r.errors.length > 0
      ? ` Fehler (${r.errors.length}): ${r.errors.slice(0, 3).join("; ")}${r.errors.length > 3 ? " …" : ""}`
      : "";
    return redir({
      ok: `Import fertig: ${r.zCount} Zertifikate, ${r.tnCount} Bescheinigungen, ${r.skipped} übersprungen.${detail}`,
    });
  } catch (e: any) {
    return redir({ error: `Import fehlgeschlagen: ${e?.message ?? e}` });
  }
}

function redir(q: Record<string, string>) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/zertifikate/import?${new URLSearchParams(q).toString()}` },
  });
}
