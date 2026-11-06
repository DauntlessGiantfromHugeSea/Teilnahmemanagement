import { redirect } from "next/navigation";
import { getSession, readRecoveryCodes } from "@/lib/session";
import { Logo } from "@/components/Logo";

// Die Codes kommen aus einem kurzlebigen httpOnly-Cookie, nicht aus der URL.
// Ein Server-Component darf keine Cookies loeschen - das uebernimmt der
// Bestaetigungs-Button ueber /api/account/2fa/recovery/ack. Faellt der Klick
// aus, laeuft das Cookie nach zehn Minuten von selbst ab.
export const dynamic = "force-dynamic";

export default async function ShowRecovery() {
  const s = await getSession();
  if (!s) redirect("/login");
  const codes = readRecoveryCodes();
  if (codes.length === 0) redirect("/account");

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-12 w-auto mb-3" />
          <h1 className="text-xl font-semibold">Deine Recovery-Codes</h1>
          <p className="text-sm text-slate-500 text-center mt-1">
            Speichere diese Codes an einem sicheren Ort. Jeder Code ist genau einmal gültig
            und ersetzt deinen 2FA-Code, falls du keinen Zugriff auf deine App hast.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {codes.map((c) => (
            <code key={c} className="font-mono text-sm bg-slate-50 border border-slate-200 px-3 py-2 rounded">
              {c}
            </code>
          ))}
        </div>
        <form method="post" action="/api/account/2fa/recovery/ack">
          <button className="btn-primary w-full">Ich habe die Codes gespeichert</button>
        </form>
      </div>
    </div>
  );
}
