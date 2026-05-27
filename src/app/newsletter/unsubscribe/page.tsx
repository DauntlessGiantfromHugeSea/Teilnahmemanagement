import { unsubscribe } from "@/lib/newsletter";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const ok = token ? await unsubscribe(token) : null;
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="card max-w-md w-full p-8 text-center">
        <Logo className="h-12 w-auto mx-auto mb-4" />
        {ok ? (
          <>
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Abgemeldet</h1>
            <p className="text-slate-600 text-sm">
              Du wurdest erfolgreich vom Newsletter abgemeldet und erhältst keine weiteren
              E-Mails mehr. Schade, dass du gehst!
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Link ungültig</h1>
            <p className="text-slate-600 text-sm">
              Dieser Abmeldelink ist ungültig. Möglicherweise bist du bereits abgemeldet.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
