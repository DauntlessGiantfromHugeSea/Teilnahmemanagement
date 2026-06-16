// Erzeugt einen leeren Brief auf FBA-Briefpapier als PDF (nur zum Drucken,
// kein Mailversand).

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
import { renderLetterPdf } from "@/lib/letterPdf";

export const maxDuration = 60;
export const runtime = "nodejs";

function s(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? "").trim();
  return t || null;
}

export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return new NextResponse("Unauthorized", { status: 401 });
  if (!canWriteGlobal(sess)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const body = String(f.get("body") ?? "").trim();
  if (!body) return new NextResponse("Brieftext fehlt.", { status: 400 });

  const pdf = await renderLetterPdf({
    recipient: s(f.get("recipient")),
    date: s(f.get("date")),
    subject: s(f.get("subject")),
    salutation: s(f.get("salutation")),
    body,
    closing: s(f.get("closing")),
    signerName: s(f.get("signerName")),
    signerRole: s(f.get("signerRole")),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="brief.pdf"`,
    },
  });
}
