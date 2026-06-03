import { NextResponse } from "next/server";
import { clearPortalCookie } from "@/lib/certPortal";

export async function POST() {
  clearPortalCookie();
  return new NextResponse(null, { status: 303, headers: { Location: "/meine-zertifikate" } });
}
