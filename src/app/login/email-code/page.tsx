import { redirect } from "next/navigation";
import Link from "next/link";
import { getPending, getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function LoginEmailCodePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const pending = await getPending();
  if (!pending) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: pending.uid },
    select: { email: true },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-12 w-auto mb-3" />
          <h1 className="text-xl font-semibold">Anmeldecode</h1>
          <p className="text-sm text-slate-500 text-center mt-1">
            Wir haben einen 6-stelligen Code an{" "}
            <span className="font-mono">{user?.email ?? "Ihre E-Mail"}</span> gesendet.
          </p>
        </div>
        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}
        <form method="post" action="/api/auth/email-code" className="space-y-4">
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
          <button className="btn-primary w-full">Anmelden</button>
        </form>
        <p className="mt-4 text-center">
          <Link href="/login" className="text-xs text-slate-500 hover:underline">
            Anmeldung abbrechen
          </Link>
        </p>
      </div>
    </div>
  );
}
