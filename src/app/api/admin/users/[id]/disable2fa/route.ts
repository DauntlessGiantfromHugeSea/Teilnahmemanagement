import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

// Schaltet 2FA fuer einen Nutzer komplett aus:
// - totpEnabled = false
// - totpRequired = false (Login auch ohne 2FA erlaubt)
// - totpSecret / recoveryCodes geloescht
//
// Ueber den Query/Form-Parameter mode kann statt deaktivieren auch nur die
// Pflicht (re)aktiviert werden.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData().catch(() => null);
  const url = new URL(req.url);
  const mode = (f?.get("mode") ?? url.searchParams.get("mode") ?? "disable").toString();

  if (mode === "require-on") {
    await prisma.user.update({
      where: { id: params.id },
      data: { totpRequired: true },
    });
    await audit({
      actorId: s.uid,
      action: "REQUIRE_2FA",
      entityType: "User",
      entityId: params.id,
    });
  } else {
    // disable
    await prisma.user.update({
      where: { id: params.id },
      data: {
        totpEnabled: false,
        totpRequired: false,
        totpSecret: null,
        recoveryCodes: null,
      },
    });
    await audit({
      actorId: s.uid,
      action: "DISABLE_2FA",
      entityType: "User",
      entityId: params.id,
    });
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/users?ok=1` },
  });
}
