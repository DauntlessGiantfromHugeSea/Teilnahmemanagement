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

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const onlyReleased = url.searchParams.get("released") === "1";

  const certs = await prisma.certificate.findMany({
    where: {
      participant: { eventId: params.id },
      status: { in: onlyReleased ? ["RELEASED"] : ["DRAFT", "RELEASED"] },
    },
    include: { participant: true },
    orderBy: { createdAt: "asc" },
  });

  if (certs.length === 0) {
    return new NextResponse("Keine Zertifikate zum Drucken.", { status: 404 });
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const combined = await PDFDocument.create();
  for (const c of certs) {
    const validateUrl = `${appUrl}/zertifikat/${c.slug}`;
    const single = await renderCertificatePdf({
      type: c.type,
      number: c.number,
      data: parseCertificateData(c.data),
      validateUrl,
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
