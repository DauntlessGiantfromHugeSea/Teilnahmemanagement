import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleMsCallback } from "@/lib/msAuth";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function back(error: string) {
  return NextResponse.redirect(
    `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/login?error=${encodeURIComponent(error)}`
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (errorParam) return back(errorParam);
  if (!code || !state) return back("Antwort von Microsoft unvollstaendig.");

  let result;
  try {
    result = await handleMsCallback(code, state);
  } catch (e: any) {
    return back(e?.message ?? "Login fehlgeschlagen.");
  }

  // 1) Per msOid bereits verknuepft?
  let user = await prisma.user.findFirst({ where: { msOid: result.claims.oid } });

  // 2) Sonst per E-Mail matchen (nur bestehende User - kein Auto-Anlegen)
  if (!user) {
    user = await prisma.user.findUnique({ where: { email: result.claims.email } });
    if (!user) {
      return back("Für diese Microsoft-Adresse ist kein Benutzer im System angelegt. Wende dich an deinen Administrator.");
    }
    if (!user.active) {
      return back("Dein Konto ist deaktiviert.");
    }
    // Einmalig verknuepfen und 2FA-Pflicht deaktivieren (MS macht eigene MFA)
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        msOid: result.claims.oid,
        msTenantId: result.claims.tid,
        totpRequired: false,
        lastLoginAt: new Date(),
      },
    });
    await audit({
      actorId: user.id,
      action: "MS_LINKED",
      entityType: "User",
      entityId: user.id,
      diff: { email: user.email, tid: result.claims.tid },
    });
  } else {
    if (!user.active) return back("Dein Konto ist deaktiviert.");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  }

  await createSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  await audit({
    actorId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    diff: { via: "microsoft" },
  });

  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return NextResponse.redirect(`${base}${result.returnTo || "/"}`);
}
