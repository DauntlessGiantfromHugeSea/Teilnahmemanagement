import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleMsCallback, msAutoLinkAllowed } from "@/lib/msAuth";
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
    // Die Erstverknuepfung stuetzt sich allein auf die Adressgleichheit.
    // Das traegt nur innerhalb des eigenen Tenants, wo die Adressen von der
    // Organisation vergeben werden. Ausserhalb - und bei privaten
    // Microsoft-Konten - ist die Adresse frei waehlbar und waere damit ein
    // Weg in ein fremdes Konto.
    if (!msAutoLinkAllowed(result.claims.tid)) {
      return back(
        "Diese Microsoft-Anmeldung stammt nicht aus der freigegebenen Organisation und kann nicht automatisch verknüpft werden. Bitte wende dich an deinen Administrator."
      );
    }
    // Einmalig verknuepfen. totpRequired bleibt unangetastet: Microsoft
    // prueft nur den Microsoft-Weg. Wird die Pflicht hier abgeschaltet,
    // kommt man anschliessend mit dem lokalen Passwort ganz ohne zweiten
    // Faktor hinein - der Microsoft-Login haette den Passwortweg also
    // geschwaecht statt gestaerkt.
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        msOid: result.claims.oid,
        msTenantId: result.claims.tid,
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
