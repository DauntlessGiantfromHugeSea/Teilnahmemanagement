import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { generateTotpSecret, totpKeyUri } from "@/lib/auth";
import { encryptField, safeDecrypt } from "@/lib/crypto";
import { getPending, getSession } from "@/lib/session";
import { Logo } from "@/components/Logo";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getSession();
  const pending = session ? null : await getPending();
  const uid = session?.uid ?? pending?.uid;
  if (!uid) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: uid! } });
  if (!user) redirect("/login");

  // Falls noch kein Secret existiert oder vorheriges nicht enabled -> neu generieren
  let plainSecret = safeDecrypt(user.totpSecret);
  if (!plainSecret || user.totpEnabled) {
    plainSecret = generateTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptField(plainSecret), totpEnabled: false },
    });
  }
  const uri = totpKeyUri(plainSecret, user.email);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo className="h-12 w-auto mb-3" />
          <h1 className="text-xl font-semibold">2-Faktor-Authentifizierung einrichten</h1>
          <p className="text-sm text-slate-500 text-center mt-1">
            Scanne den QR-Code mit deiner Authenticator-App (z.B. Google Authenticator, Authy, 1Password).
          </p>
        </div>
        <div className="flex justify-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR" className="rounded border border-slate-200" />
        </div>
        <div className="text-center mb-6">
          <div className="text-xs text-slate-500">Manueller Schluessel</div>
          <code className="text-sm font-mono select-all break-all">{plainSecret}</code>
        </div>
        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            Code ungueltig. Bitte erneut versuchen.
          </div>
        )}
        <form method="post" action="/api/account/2fa/enable" className="space-y-4">
          <div>
            <label className="label">Code zur Bestaetigung</label>
            <input
              name="code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input text-center text-lg tracking-widest"
            />
          </div>
          <button className="btn-primary w-full">Aktivieren</button>
        </form>
      </div>
    </div>
  );
}
