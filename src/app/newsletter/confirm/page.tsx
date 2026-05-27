import { confirm } from "@/lib/newsletter";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const ok = token ? await confirm(token) : null;
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="card max-w-md w-full p-8 text-center">
        <Logo className="h-12 w-auto mx-auto mb-4" />
        {ok ? (
          <>
            <h1 className="text-xl font-semibold text-green-700 mb-2">Anmeldung bestätigt</h1>
            <p className="text-slate-600 text-sm">
              Vielen Dank! Du erhältst ab jetzt unseren Newsletter. Du kannst dich jederzeit
              über den Link am Ende jeder E-Mail wieder abmelden.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Link ungültig</h1>
            <p className="text-slate-600 text-sm">
              Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
