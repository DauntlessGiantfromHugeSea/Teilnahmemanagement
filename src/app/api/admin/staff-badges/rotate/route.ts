import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { rotateStaffPortalToken } from "@/lib/staffPortalToken";

export async function POST() {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  await rotateStaffPortalToken();
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/admin/staff-badges?ok=" + encodeURIComponent("Token erneuert. Bitte neue Mitarbeiter-Badges drucken."),
    },
  });
}
