import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createCertificateDraft } from "@/lib/certificates";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const participantId = String(f.get("participantId") ?? "");
  const type = String(f.get("type") ?? "") as "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG";
  const kompetenz = f.getAll("kompetenz").map((v) => String(v));

  if (!participantId || (type !== "ZERTIFIKAT" && type !== "TEILNAHMEBESCHEINIGUNG")) {
    return back(params.id, { error: "Ungültige Eingabe." });
  }
  const p = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!p || p.eventId !== params.id) {
    return back(params.id, { error: "Teilnehmer nicht gefunden." });
  }

  try {
    const res = await createCertificateDraft({
      participantId,
      type,
      createdById: s.uid,
      kompetenzfeldIds: type === "ZERTIFIKAT" ? kompetenz : undefined,
    });
    return back(params.id, { ok: `${type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahmebescheinigung"} ${res.number} angelegt.` });
  } catch (e: any) {
    return back(params.id, { error: e?.message ?? "Fehler beim Anlegen." });
  }
}

function back(eventId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${eventId}/certificates${qs ? `?${qs}` : ""}` },
  });
}
