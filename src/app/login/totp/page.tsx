import { redirect } from "next/navigation";
import { getPending, getSession } from "@/lib/session";
import { Logo } from "@/components/Logo";

export default async function TotpPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (await getSession()) redirect("/dashboard");
  const pending = await getPending();
  if (!pending) redirect("/login");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-800">2-Faktor-Bestaetigung</h1>
          <p className="text-sm text-slate-500">Code aus deiner Authenticator-App</p>
        </div>
        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            Code ungueltig oder abgelaufen.
          </div>
        )}
        <form method="post" action="/api/auth/totp" className="space-y-4">
          <div>
            <label className="label">6-stelliger Code</label>
            <input
              name="code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,8}"
              className="input text-center text-lg tracking-widest"
            />
          </div>
          <button className="btn-primary w-full">Anmelden</button>
        </form>
        <p className="mt-6 text-xs text-slate-400 text-center">
          Kein Zugriff auf deine App? Verwende einen Recovery-Code:{" "}
          <a href="/login/recovery" className="underline">
            Recovery
          </a>
        </p>
      </div>
    </div>
  );
}
