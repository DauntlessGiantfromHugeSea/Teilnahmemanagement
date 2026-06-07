import { NextResponse } from "next/server";
import { msConfigured, startMsLogin } from "@/lib/msAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!msConfigured()) {
    return new NextResponse("Microsoft-Login ist nicht konfiguriert.", { status: 503 });
  }
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";
  const authUrl = await startMsLogin(returnTo);
  return NextResponse.redirect(authUrl);
}
