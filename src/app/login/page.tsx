import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Logo } from "@/components/Logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const s = await getSession();
  if (s) redirect("/dashboard");

  const errorMsg = errorText(searchParams.error);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-800">Anmelden</h1>
          <p className="text-sm text-slate-500">Teilnahmemanagement</p>
        </div>
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
        <p className="mt-6 text-xs text-slate-400 text-center">
          Bei Problemen wende dich an deinen Administrator.
        </p>
        <p className="mt-2 text-xs text-slate-300 text-center">
          <Link href="/login">zurueck</Link>
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
      return "2FA-Code ungueltig.";
    default:
      return null;
  }
}
