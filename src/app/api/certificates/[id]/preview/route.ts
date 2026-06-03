import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canViewEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { parseCertificateData } from "@/lib/certificates";
import { renderCertificatePdf } from "@/lib/certificatePdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  const noBackground = new URL(req.url).searchParams.get("bg") === "0";

  const cert = await prisma.certificate.findUnique({
    where: { id: params.id },
    include: { participant: true },
  });
  if (!cert) return new NextResponse("Not found", { status: 404 });
  if (!(await canViewEvent(s, cert.participant.eventId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const validateUrl = `${appUrl}/zertifikat/${cert.slug}`;

  const pdf = await renderCertificatePdf({
    type: cert.type,
    number: cert.number,
    data: parseCertificateData(cert.data),
    validateUrl,
    noBackground,
  });

  const safeName = cert.number.replace(/[\\/?*\[\]:]/g, "-");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
