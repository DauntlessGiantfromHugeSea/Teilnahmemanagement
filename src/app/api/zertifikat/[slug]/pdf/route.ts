import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCertificateData } from "@/lib/certificates";
import { renderCertificatePdf } from "@/lib/certificatePdf";
import { getPortalEmailHash } from "@/lib/certPortal";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  // PDF nur fuer Teilnehmer, die sich ueber /meine-zertifikate per OTP
  // angemeldet haben - die Validierungsseite zeigt nur noch die Gueltigkeit,
  // ohne Download.
  const portalHash = await getPortalEmailHash();
  if (!portalHash) return new NextResponse("Nicht autorisiert.", { status: 403 });

  const cert = await prisma.certificate.findUnique({ where: { slug: params.slug } });
  if (!cert) return new NextResponse("Not found", { status: 404 });

  const participant = cert.participantId
    ? await prisma.participant.findUnique({ where: { id: cert.participantId }, select: { emailHash: true } })
    : null;
  if (!participant?.emailHash || participant.emailHash !== portalHash) {
    return new NextResponse("Nicht autorisiert.", { status: 403 });
  }

  if (cert.status === "REVOKED") {
    return new NextResponse("Widerrufen.", { status: 410 });
  }
  if (cert.status !== "RELEASED") {
    return new NextResponse("Nicht freigegeben.", { status: 403 });
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const validateUrl = `${appUrl}/zertifikat/${cert.slug}`;

  const pdf = await renderCertificatePdf({
    type: cert.type,
    number: cert.number,
    data: parseCertificateData(cert.data),
    validateUrl,
  });

  const safeName = cert.number.replace(/[\\/?*\[\]:]/g, "-");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="zertifikat_${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
