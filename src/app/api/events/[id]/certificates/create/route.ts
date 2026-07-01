import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createCertificateDraft, isTwoDayEvent } from "@/lib/certificates";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const type = String(f.get("type") ?? "") as "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG";
  const kompetenz = f.getAll("kompetenz").map((v) => String(v));
  // Bulk: alle participantIds aus dem Formular ziehen; ansonsten Fallback auf
  // den einzelnen 'participantId'-Wert.
  const explicit = f.getAll("participantIds").map((v) => String(v)).filter(Boolean);
  const single = String(f.get("participantId") ?? "").trim();
  const participantIds = explicit.length > 0 ? explicit : single ? [single] : [];

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/certificates?${new URLSearchParams(q).toString()}` },
  });

  if (participantIds.length === 0) return back({ error: "Bitte mindestens einen Teilnehmer auswählen." });
  if (type !== "ZERTIFIKAT" && type !== "TEILNAHMEBESCHEINIGUNG") return back({ error: "Ungültiger Typ." });

  // Event laden (fuer Tag-Logik) + Teilnehmer holen
  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) return back({ error: "Veranstaltung nicht gefunden." });
  const participants = await prisma.participant.findMany({
    where: { id: { in: participantIds }, eventId: params.id },
  });
  if (participants.length === 0) return back({ error: "Keine passenden Teilnehmer gefunden." });

  const twoDay = isTwoDayEvent(event);
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  const uid = s.uid;
  async function make(args: { participantId: string; kompetenzfeldId?: string; dayIndex?: 1 | 2 }) {
    try {
      const res = await createCertificateDraft({
        participantId: args.participantId,
        type,
        createdById: uid,
        kompetenzfeldId: args.kompetenzfeldId,
        dayIndex: args.dayIndex,
      });
      if (res.skipped) skipped++;
      else created++;
    } catch (e: any) {
      errors.push(`${args.participantId}: ${e?.message ?? e}`);
    }
  }

  if (type === "ZERTIFIKAT") {
    const ids = kompetenz.filter(Boolean);
    if (ids.length === 0) return back({ error: "Bitte mindestens ein Kompetenzfeld auswählen." });
    for (const p of participants) {
      for (const k of ids) {
        await make({ participantId: p.id, kompetenzfeldId: k });
      }
    }
  } else {
    // Teilnahmebescheinigung: respektiert dayOption (DAY_1 / DAY_2 / BOTH)
    for (const p of participants) {
      if (!twoDay) {
        await make({ participantId: p.id });
      } else {
        if (p.dayOption === "DAY_1" || p.dayOption === "BOTH") {
          await make({ participantId: p.id, dayIndex: 1 });
        }
        if (p.dayOption === "DAY_2" || p.dayOption === "BOTH") {
          await make({ participantId: p.id, dayIndex: 2 });
        }
      }
    }
  }

  const parts = [
    `${created} neu`,
    skipped > 0 ? `${skipped} bereits vorhanden` : "",
    errors.length > 0 ? `${errors.length} Fehler` : "",
  ].filter(Boolean).join(", ");
  return back({ ok: `${type === "ZERTIFIKAT" ? "Zertifikate" : "Teilnahmebescheinigungen"} – ${parts}.` });
}
