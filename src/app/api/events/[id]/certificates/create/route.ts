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
    if (type === "ZERTIFIKAT") {
      const ids = kompetenz.filter(Boolean);
      if (ids.length === 0) {
        return back(params.id, { error: "Bitte mindestens ein Kompetenzfeld auswählen." });
      }
      // Pro Kompetenzfeld ein eigenes Zertifikat anlegen.
      const created: string[] = [];
      for (const k of ids) {
        const res = await createCertificateDraft({
          participantId,
          type,
          createdById: s.uid,
          kompetenzfeldIds: [k],
        });
        created.push(res.number);
      }
      return back(params.id, {
        ok:
          created.length === 1
            ? `Zertifikat ${created[0]} angelegt.`
            : `${created.length} Zertifikate angelegt (je Kompetenzfeld).`,
      });
    } else {
      const res = await createCertificateDraft({
        participantId,
        type,
        createdById: s.uid,
      });
      return back(params.id, { ok: `Teilnahmebescheinigung ${res.number} angelegt.` });
    }
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
