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
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Linke Seite: Hero mit FBA-Branding */}
      <div className="hidden lg:flex relative overflow-hidden fba-hero text-white items-center justify-center p-12">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-md">
          <Logo className="h-14 w-auto mb-8 brightness-0 invert" />
          <div className="fba-pill mb-5">Teilnahmemanagement</div>
          <h2 className="text-4xl font-bold tracking-tight leading-tight">
            Wissen.<br />
            Qualität.<br />
            Flüssigboden.
          </h2>
          <p className="mt-6 text-white/80 text-sm leading-relaxed">
            Die zentrale Plattform der Flüssigboden Akademie für Schulungen,
            Teilnehmer-Verwaltung und Zertifikate.
          </p>
        </div>
      </div>

      {/* Rechte Seite: Login-Karte */}
      <div className="flex items-center justify-center px-4 py-10 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center mb-6">
            <Logo className="h-14 w-auto mb-3" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-1">Willkommen zurück</h1>
          <p className="text-sm text-slate-500 mb-6">Bitte melde dich an, um fortzufahren.</p>
          {okMsg && (
            <div className="mb-4 toast-ok">
              <span aria-hidden>✓</span><span>{okMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 toast-error">
              <span aria-hidden>!</span><span>{errorMsg}</span>
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
            <button className="btn-primary w-full py-3 text-base">Anmelden</button>
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
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-ink transition"
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
          <p className="mt-8 text-xs text-slate-400 text-center">
            Bei Problemen wende dich an deinen Administrator.
          </p>
        </div>
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
