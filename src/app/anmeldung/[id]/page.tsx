import { notFound } from "next/navigation";
import Script from "next/script";
import { prisma } from "@/lib/db";
import { basePriceCents, formatEUR } from "@/lib/pricing";
import { DayOption } from "@prisma/client";

interface Props {
  params: { id: string };
  searchParams: { error?: string; day?: string };
}

function dayLabel(d: DayOption) {
  return d === "DAY_1" ? "Tag 1" : d === "DAY_2" ? "Tag 2" : "Beide Tage";
}

export default async function AnmeldungPage({ params, searchParams }: Props) {
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { training: true, _count: { select: { participants: true } } },
  });
  if (!ev) notFound();

  // Optional: Veranstaltung in Vergangenheit oder Kapazitaet voll
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const lastDate = ev.day2Date ?? ev.day1Date;
  const isPast = lastDate ? lastDate < todayStart : false;
  const isFull = ev.capacity != null && ev._count.participants >= ev.capacity;

  const turnstileKey = process.env.TURNSTILE_SITE_KEY ?? "";

  const day1 = ev.day1Date ? ev.day1Date.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : null;
  const day2 = ev.day2Date ? ev.day2Date.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : null;
  const dateLine = day1 && day2 ? `${day1} - ${day2}` : day1 ?? day2 ?? "";

  // Standard-Buchungsoption + Preis: bei 2-Tages-Schulungen BOTH, sonst DAY_1
  const defaultDay: DayOption = ev.day2Date ? "BOTH" : "DAY_1";
  const basePrice = basePriceCents(ev.training, defaultDay);

  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-8 bg-transparent">
      <div className="w-full max-w-xl">
        <div className="card p-6 sm:p-8">
          {(isPast || isFull) ? (
            <div className="text-center py-8">
              <h1 className="text-xl font-semibold mb-2">
                {isPast ? "Anmeldung geschlossen" : "Veranstaltung ausgebucht"}
              </h1>
              <p className="text-sm text-slate-600">
                {isPast
                  ? "Diese Veranstaltung hat bereits stattgefunden."
                  : "Diese Veranstaltung ist leider voll belegt."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-6">
                <div>
                  <h1 className="text-xl font-semibold">Verbindliche Anmeldung</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {ev.title}
                    {dateLine ? ` · ${dateLine}` : ""}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 text-brand-700 px-3 py-1 text-xs font-medium whitespace-nowrap">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  SSL-verschluesselt
                </span>
              </div>

              {searchParams.error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {errorLabel(searchParams.error)}
                </div>
              )}

              <form method="post" action={`/api/public/anmeldung/${ev.id}`} className="space-y-4">
                {/* Honeypot - echte Nutzer sehen das Feld nicht */}
                <div className="hidden" aria-hidden="true">
                  <label>
                    Webseite (bitte leer lassen)
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <input type="hidden" name="ts" value={String(Date.now())} />

                {turnstileKey && (
                  <div className="my-3">
                    <div
                      className="cf-turnstile"
                      data-sitekey={turnstileKey}
                      data-theme="light"
                    />
                    <Script
                      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                      strategy="afterInteractive"
                      async
                      defer
                    />
                  </div>
                )}

                <Field name="name" label="Nachname, Vorname" required />
                <Field name="company" label="Firma / Arbeitgeber" required />
                <Field name="street" label="Strasse, Hausnummer" />
                <div className="grid grid-cols-2 gap-3">
                  <Field name="zip" label="PLZ" />
                  <Field name="city" label="Ort" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field name="phone" label="Telefon" />
                  <Field name="email" label="E-Mail-Adresse" type="email" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field name="billingEmail" label="E-Mail (Rechnungsadresse)" type="email" />
                  <Field name="costCenter" label="Kostenstelle" labelSuffix="(optional)" />
                </div>

                {ev.day2Date && (
                  <div>
                    <label className="label">Buchungsoption *</label>
                    <select name="dayOption" defaultValue="BOTH" className="input" required>
                      <option value="DAY_1">Nur Tag 1 ({day1})</option>
                      <option value="DAY_2">Nur Tag 2 ({day2})</option>
                      <option value="BOTH">Beide Tage</option>
                    </select>
                  </div>
                )}

                <label className="flex items-start gap-2 text-sm pt-2">
                  <input
                    type="checkbox"
                    name="dataProtection"
                    required
                    className="mt-1 h-4 w-4 accent-brand-500"
                  />
                  <span>
                    Ich habe die{" "}
                    <a
                      href="https://fb-akademie.de/datenschutz"
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-700 underline"
                    >
                      Datenschutzerklaerung
                    </a>{" "}
                    gelesen und bin damit einverstanden, dass meine Daten zur Bearbeitung
                    meiner Anmeldung verwendet werden.
                  </span>
                </label>

                <button className="btn-primary w-full mt-4">Jetzt anmelden</button>
              </form>

              {basePrice > 0 && (
                <div className="mt-6 border-l-4 border-brand-500 bg-brand-50/40 px-4 py-3 text-sm text-slate-700">
                  Die Teilnahmegebuehr betraegt{" "}
                  <strong>{formatEUR(basePrice)} zzgl. 19 % MwSt.</strong>
                  {ev.day2Date && ` (${dayLabel(defaultDay)})`} Die Rechnung wird Ihnen
                  nach der Anmeldung zugesandt.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  labelSuffix,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  labelSuffix?: string;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required ? <span className="text-brand-600"> *</span> : null}
        {labelSuffix ? <span className="text-slate-400 font-normal"> {labelSuffix}</span> : null}
      </label>
      <input name={name} type={type} required={required} className="input" placeholder={label} />
    </div>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "captcha":
      return "Bitte bestaetige, dass du kein Bot bist.";
    case "missing":
      return "Bitte alle Pflichtfelder ausfuellen.";
    case "duplicate":
      return "Es liegt bereits eine Anmeldung mit dieser E-Mail-Adresse fuer diese Veranstaltung vor.";
    case "full":
      return "Diese Veranstaltung ist leider ausgebucht.";
    default:
      return "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.";
  }
}
