import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { importAnmeldungenCsv, importKontakteCsv, detectFormat } from "@/lib/csvImport";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const mode = String(f.get("mode") ?? "");
  const file = f.get("file");
  if (!(file instanceof File)) {
    return new NextResponse("Keine Datei", { status: 400 });
  }
  const csv = await file.text();

  let result;
  if (mode === "anmeldungen") {
    const detected = detectFormat(csv);
    if (detected !== "anmeldungen") {
      return new NextResponse(
        "Format nicht erkannt - erwartet wurde 'training-date' in Header.",
        { status: 400 }
      );
    }
    result = await importAnmeldungenCsv(csv, { actorId: s.uid });
  } else if (mode === "kontakte") {
    const eventId = String(f.get("eventId") ?? "");
    if (!eventId) return new NextResponse("eventId fehlt", { status: 400 });
    result = await importKontakteCsv(csv, { eventId });
  } else {
    return new NextResponse("Unbekannter Modus", { status: 400 });
  }

  // Vollstaendiges Ergebnis im AuditLog persistieren - die zurueckgegebene
  // ID landet als kurzer Query-Parameter in der Redirect-URL. Vermeidet
  // ueberlange URLs (Safari downloadet die ansonsten als leere Datei).
  const log = await prisma.auditLog.create({
    data: {
      actorId: s.uid,
      action: "IMPORT_CSV",
      entityType: mode === "anmeldungen" ? "Event" : "Participant",
      diff: JSON.stringify({ mode, ...result }),
    },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/import?resultId=${log.id}` },
  });
}
