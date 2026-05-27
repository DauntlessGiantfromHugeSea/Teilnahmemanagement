import Link from "next/link";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/pwToken";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string; error?: string };
}) {
  const token = (searchParams.token ?? "").trim();
  let state: "ok" | "missing" | "invalid" | "expired" = "ok";

  if (!token) {
    state = "missing";
  } else {
    const user = await prisma.user.findFirst({
      where: { pwTokenHash: hashToken(token) },
      select: { id: true, pwTokenExpiresAt: true, active: true },
    });
    if (!user || !user.active) state = "invalid";
    else if (!user.pwTokenExpiresAt || user.pwTokenExpiresAt < new Date()) state = "expired";
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-800">Passwort festlegen</h1>
          <p className="text-sm text-slate-500">Teilnahmemanagement</p>
        </div>

        {state === "missing" && (
          <p className="text-sm text-slate-600">
            Es fehlt ein gültiger Einladungs-Link. Bitte öffnen Sie den Link aus der E-Mail.
          </p>
        )}
        {state === "invalid" && (
          <p className="text-sm text-red-700">
            Dieser Link ist ungültig oder wurde bereits eingelöst. Bitte fordern Sie einen neuen Link bei Ihrem Administrator an.
          </p>
        )}
        {state === "expired" && (
          <p className="text-sm text-red-700">
            Dieser Link ist abgelaufen. Bitte fordern Sie einen neuen Link bei Ihrem Administrator an.
          </p>
        )}

        {state === "ok" && (
          <>
            {searchParams.error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {searchParams.error}
              </div>
            )}
            <form method="post" action="/api/public/set-password" className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <label className="label">Neues Passwort (min. 10 Zeichen)</label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={10}
                  autoFocus
                  autoComplete="new-password"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Passwort wiederholen</label>
                <input
                  type="password"
                  name="password2"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="input"
                />
              </div>
              <button className="btn-primary w-full">Passwort speichern</button>
            </form>
            <p className="mt-6 text-xs text-slate-400 text-center">
              Nach dem Speichern werden Sie zur Anmeldung weitergeleitet.
            </p>
          </>
        )}

        <p className="mt-6 text-xs text-slate-400 text-center">
          <Link href="/login">Zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
}
