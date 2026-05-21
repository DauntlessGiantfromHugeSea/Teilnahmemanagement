import { redirect } from "next/navigation";
import { getPending, getSession } from "@/lib/session";
import { Logo } from "@/components/Logo";

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (await getSession()) redirect("/dashboard");
  if (!(await getPending())) redirect("/login");
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-800">Recovery-Code</h1>
        </div>
        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            Code ungültig.
          </div>
        )}
        <form method="post" action="/api/auth/recovery" className="space-y-4">
          <div>
            <label className="label">Recovery-Code</label>
            <input
              name="code"
              required
              autoFocus
              className="input font-mono tracking-wider"
              placeholder="xxxxx-xxxxx"
            />
          </div>
          <button className="btn-primary w-full">Anmelden</button>
        </form>
        <p className="mt-6 text-xs text-slate-400 text-center">
          Jeder Code ist einmalig gültig. Du wirst danach gebeten, 2FA neu einzurichten.
        </p>
      </div>
    </div>
  );
}
