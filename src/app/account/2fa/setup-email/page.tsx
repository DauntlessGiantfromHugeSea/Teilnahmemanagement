import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPending, getSession } from "@/lib/session";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function SetupEmailPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string };
}) {
  const session = await getSession();
  const pending = session ? null : await getPending();
  const uid = session?.uid ?? pending?.uid;
  if (!uid) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) redirect("/login");

  const hasPending = !!user.loginCodeHash && !!user.loginCodeExpiresAt && user.loginCodeExpiresAt > new Date();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-12 w-auto mb-3" />
          <h1 className="text-xl font-semibold">2-FA per E-Mail einrichten</h1>
          <p className="text-sm text-slate-500 text-center mt-1">
            Sie erhalten bei jedem Login einen 6-stelligen Code an{" "}
            <span className="font-mono">{user.email}</span>.
          </p>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        {!hasPending ? (
          <form method="post" action="/api/account/2fa/email/start" className="space-y-4">
            <p className="text-sm text-slate-600">
              Klicken Sie unten, um einen Test-Code an Ihre Adresse zu senden. Damit
              bestätigen wir, dass Sie das Postfach lesen können.
            </p>
            <button className="btn-primary w-full">Test-Code per E-Mail senden</button>
          </form>
        ) : (
          <>
            <form method="post" action="/api/account/2fa/email/enable" className="space-y-4">
              <p className="text-sm text-slate-600">
                Ein Code wurde an <span className="font-mono">{user.email}</span> gesendet. Bitte
                hier eintragen (10 Minuten gültig):
              </p>
              <div>
                <label className="label">Code</label>
                <input
                  name="code"
                  required
                  autoFocus
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="input text-center text-lg tracking-widest"
                />
              </div>
              <button className="btn-primary w-full">Aktivieren</button>
            </form>
            <form method="post" action="/api/account/2fa/email/start" className="mt-2">
              <button className="btn-secondary text-xs w-full">Neuen Code senden</button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <Link href="/account" className="text-xs text-slate-500 hover:underline">
            ← Zurück
          </Link>
        </div>
      </div>
    </div>
  );
}
