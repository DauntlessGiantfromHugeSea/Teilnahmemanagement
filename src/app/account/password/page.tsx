import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";

export default async function ChangePassword({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  return (
    <Shell session={s} active="">
      <h1 className="text-2xl font-semibold mb-6">Passwort aendern</h1>
      <div className="card p-6 max-w-md">
        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {searchParams.error === "current" ? "Aktuelles Passwort falsch." : "Eingabe ungültig."}
          </div>
        )}
        {searchParams.ok && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
            Passwort aktualisiert.
          </div>
        )}
        <form method="post" action="/api/account/password" className="space-y-4">
          <div>
            <label className="label">Aktuelles Passwort</label>
            <input type="password" name="current" required className="input" />
          </div>
          <div>
            <label className="label">Neues Passwort (min. 10 Zeichen)</label>
            <input type="password" name="next" required minLength={10} className="input" />
          </div>
          <button className="btn-primary">Speichern</button>
        </form>
      </div>
    </Shell>
  );
}
