import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import { DEFAULT_GREETING, getCompanySignature, renderSignatureHtml } from "@/lib/mailSignature";

export const dynamic = "force-dynamic";

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="input text-sm w-full"
      />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default async function SignaturPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");

  const [user, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: s.uid } }),
    getCompanySignature(),
  ]);
  if (!user) redirect("/login");

  const previewHtml = renderSignatureHtml(user, company);

  return (
    <Shell session={s}>
      <h1 className="text-2xl font-semibold mb-1">Meine E-Mail-Signatur</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Diese Signatur hängt unter jeder Antwort, die du aus dem Posteingang verschickst.
        Rechtsangaben, Logo und Vertraulichkeitshinweis kommen zentral dazu und werden vom
        Administrator gepflegt.
      </p>

      {searchParams.ok && (
        <div className="toast-ok mb-4">
          <span aria-hidden>✓</span>
          <span>{searchParams.ok}</span>
        </div>
      )}
      {searchParams.error && (
        <div className="toast-error mb-4">
          <span aria-hidden>!</span>
          <span>{searchParams.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <form method="post" action="/api/account/mail-signature" className="card p-5 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="sigEnabled"
              defaultChecked={user.sigEnabled}
              className="h-4 w-4"
            />
            Signatur an meine Antworten anhängen
          </label>

          <Field
            name="sigGreeting"
            label="Grußformel"
            defaultValue={user.sigGreeting}
            placeholder={DEFAULT_GREETING}
            hint={`Leer = „${DEFAULT_GREETING}“`}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              name="sigName"
              label="Name"
              defaultValue={user.sigName}
              placeholder={user.name}
              hint={`Leer = „${user.name}“`}
            />
            <Field
              name="sigTitle"
              label="Titel / Position"
              defaultValue={user.sigTitle}
              placeholder="Marketing Manager"
            />
          </div>

          <Field
            name="sigCompany"
            label="Firma"
            defaultValue={user.sigCompany}
            placeholder="Flüssigboden Akademie UG"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              name="sigPhone"
              label="Telefon"
              defaultValue={user.sigPhone}
              placeholder="+49 176 8990 2201"
            />
            <Field
              name="sigMobile"
              label="Mobil / WhatsApp"
              defaultValue={user.sigMobile}
              placeholder="+49 176 8990 2201"
              hint="Wird als WhatsApp-Link hinter der Telefonnummer angezeigt."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              name="sigEmail"
              label="E-Mail"
              defaultValue={user.sigEmail}
              placeholder={user.email}
              hint={`Leer = „${user.email}“`}
            />
            <Field name="sigFax" label="Fax" defaultValue={user.sigFax} placeholder="+49 341 24469-32" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="sigWeb" label="Website" defaultValue={user.sigWeb} placeholder="fb-akademie.de" />
            <Field
              name="sigLinkedIn"
              label="LinkedIn"
              defaultValue={user.sigLinkedIn}
              placeholder="linkedin.com/in/…"
            />
          </div>

          <Field
            name="sigAddress"
            label="Anschrift"
            defaultValue={user.sigAddress}
            placeholder="Merseburger Str. 189, 04179 Leipzig"
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn-primary text-sm">Signatur speichern</button>
            <button name="preview" value="1" formTarget="_blank" className="btn-secondary text-sm">
              Vorschau im neuen Tab
            </button>
          </div>
        </form>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            Vorschau <span className="font-normal text-slate-400">(gespeicherter Stand)</span>
          </h2>
          {user.sigEnabled ? (
            <iframe
              title="Signatur-Vorschau"
              sandbox=""
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:#fff;">${previewHtml}</body></html>`}
              className="w-full h-[560px] rounded border border-slate-200 bg-white"
            />
          ) : (
            <p className="text-sm text-slate-500">
              Die Signatur ist abgeschaltet — Antworten gehen ohne sie raus.
            </p>
          )}
        </section>
      </div>
    </Shell>
  );
}
