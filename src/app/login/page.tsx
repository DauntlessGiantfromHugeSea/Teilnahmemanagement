import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Logo } from "@/components/Logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const s = await getSession();
  if (s) redirect("/dashboard");

  const errorMsg = errorText(searchParams.error);
  const okMsg =
    searchParams.ok === "password-set"
      ? "Passwort gespeichert. Bitte melden Sie sich jetzt an."
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-800">Anmelden</h1>
          <p className="text-sm text-slate-500">Teilnahmemanagement</p>
        </div>
        {okMsg && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
            {okMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
        <form method="post" action="/api/auth/login" className="space-y-4">
          <div>
            <label className="label">E-Mail</label>
            <input type="email" name="email" required autoFocus className="input" />
          </div>
          <div>
            <label className="label">Passwort</label>
            <input type="password" name="password" required className="input" />
          </div>
          <button className="btn-primary w-full">Weiter</button>
        </form>
        {process.env.MS_CLIENT_ID && (
          <>
            <div className="flex items-center my-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="px-3 text-xs uppercase tracking-wider text-slate-400">oder</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <a
              href="/api/auth/microsoft/start"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800"
            >
              <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
                <rect width="10" height="10" x="1" y="1" fill="#f25022" />
                <rect width="10" height="10" x="12" y="1" fill="#7fba00" />
                <rect width="10" height="10" x="1" y="12" fill="#00a4ef" />
                <rect width="10" height="10" x="12" y="12" fill="#ffb900" />
              </svg>
              Mit Microsoft anmelden
            </a>
          </>
        )}
        <p className="mt-6 text-xs text-slate-400 text-center">
          Bei Problemen wende dich an deinen Administrator.
        </p>
        <p className="mt-2 text-xs text-slate-300 text-center">
          <Link href="/login">zurück</Link>
        </p>
      </div>
    </div>
  );
}

function errorText(code?: string) {
  switch (code) {
    case "invalid":
      return "E-Mail oder Passwort falsch.";
    case "inactive":
      return "Konto deaktiviert.";
    case "totp":
      return "2FA-Code ungültig.";
    default:
      return null;
  }
}
