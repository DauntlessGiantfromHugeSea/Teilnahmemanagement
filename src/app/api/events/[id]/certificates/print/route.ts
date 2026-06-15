// Bulk-PDF: alle (oder gefilterten) Zertifikate eines Events zu einem Druck-PDF.
// Standard: alle DRAFT + RELEASED (also auch noch-nicht-freigegebene, damit man
// schon vor dem Event drucken und nach dem Event unterschreiben kann).

import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { parseCertificateData } from "@/lib/certificates";
import { renderCertificatePdf } from "@/lib/certificatePdf";
import { getCertTexts } from "@/lib/kompetenzfelder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const onlyReleased = url.searchParams.get("released") === "1";
  const noBackground = url.searchParams.get("bg") === "0";
  // Optional auf einen Typ einschraenken: ?type=TN oder ?type=Z
  const typeParam = url.searchParams.get("type");
  const typeFilter: ("ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG")[] | undefined =
    typeParam === "TN" ? ["TEILNAHMEBESCHEINIGUNG"]
    : typeParam === "Z" ? ["ZERTIFIKAT"]
    : undefined;

  // Explizit ueber Participant-IDs filtern - Prisma's relation-filter ist
  // hier robuster und liefert auch dann, wenn Participant-Indices fehlen.
  const participants = await prisma.participant.findMany({
    where: { eventId: params.id },
    select: { id: true },
  });
  if (participants.length === 0) {
    return new NextResponse("Diese Veranstaltung hat keine Teilnehmer.", { status: 404 });
  }
  const participantIds = participants.map((p) => p.id);

  const certs = await prisma.certificate.findMany({
    where: {
      participantId: { in: participantIds },
      status: { in: onlyReleased ? ["RELEASED"] : ["DRAFT", "RELEASED"] },
      ...(typeFilter ? { type: { in: typeFilter } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  if (certs.length === 0) {
    // Sag dem Admin warum: gibt es vielleicht nur REVOKED-Eintraege?
    const total = await prisma.certificate.count({
      where: { participantId: { in: participantIds } },
    });
    const msg = total === 0
      ? "Für diese Veranstaltung wurden noch keine Zertifikate angelegt."
      : `Keine ${onlyReleased ? "freigegebenen " : ""}Zertifikate zum Drucken vorhanden (insgesamt ${total} Eintrag/Eintraege, davon evtl. widerrufen).`;
    return new NextResponse(msg, { status: 404 });
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  // Live-Texte einmal vorab laden, damit nicht pro Zertifikat ein DB-Lookup
  // gemacht wird.
  const liveTexts = noBackground ? await getCertTexts() : null;
  const gfSignatureUrlOverride = liveTexts?.gfSignatureUrl ?? null;

  const combined = await PDFDocument.create();
  for (const c of certs) {
    const validateUrl = `${appUrl}/zertifikat/${c.slug}`;
    const single = await renderCertificatePdf({
      type: c.type,
      number: c.number,
      data: parseCertificateData(c.data),
      validateUrl,
      noBackground,
      gfSignatureUrlOverride,
    });
    const src = await PDFDocument.load(single);
    const pages = await combined.copyPages(src, src.getPageIndices());
    pages.forEach((p) => combined.addPage(p));
  }
  const bytes = await combined.save();
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="zertifikate_${params.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
