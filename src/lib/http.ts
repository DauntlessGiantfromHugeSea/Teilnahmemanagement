import { NextResponse } from "next/server";

// Relativer 303-Redirect. Host-unabhaengig - korrekt hinter Reverse-Proxy.
export function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
