import { NextResponse } from "next/server";
import { clearRecoveryCodes, getSession } from "@/lib/session";

// Bestaetigt die Anzeige der Recovery-Codes und loescht das Einmal-Cookie.
export async function POST() {
  const s = await getSession();
  if (!s) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
  clearRecoveryCodes();
  return new NextResponse(null, { status: 303, headers: { Location: `/dashboard` } });
}
