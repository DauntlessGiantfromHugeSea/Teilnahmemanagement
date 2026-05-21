import { notFound } from "next/navigation";
import Script from "next/script";
import { prisma } from "@/lib/db";
import { basePriceCents, formatEUR } from "@/lib/pricing";
import { DayOption } from "@prisma/client";

interface Props {
  params: { id: string };
  searchParams: { error?: string; day?: string };
}

export default async function AnmeldungPage({ params, searchParams }: Props) {
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { training: true, _count: { select: { participants: true } } },
  });
  if (!ev) notFound();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const lastDate = ev.day2Date ?? ev.day1Date;
  const isPast = lastDate ? lastDate < todayStart : false;
  const isFull = ev.capacity != null && ev._count.participants >= ev.capacity;

  const turnstileKey = process.env.TURNSTILE_SITE_KEY ?? "";

  const fmt = (d?: Date | null) =>
    d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : null;
  const day1 = fmt(ev.day1Date);
  const day2 = fmt(ev.day2Date);

  const isTwoDay = !!ev.day2Date;
  const priceDay1 = basePriceCents(ev.training, "DAY_1");
  const priceDay2 = basePriceCents(ev.training, "DAY_2");
  const priceBoth = basePriceCents(ev.training, "BOTH");
  const defaultDay: DayOption = isTwoDay ? "BOTH" : "DAY_1";
  const singlePrice = basePriceCents(ev.training, "DAY_1");

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
                  <p className="text-sm text-slate-500 mt-1">{ev.title}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 text-brand-700 px-3 py-1 text-xs font-medium whitespace-nowrap">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  SSL-verschlüsselt
                </span>
              </div>

              {searchParams.error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {errorLabel(searchParams.error)}
                </div>
              )}

              <form method="post" action={`/api/public/anmeldung/${ev.id}`} className="space-y-5">
                <div className="hidden" aria-hidden="true">
                  <label>
                    Webseite (bitte leer lassen)
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <input type="hidden" name="ts" value={String(Date.now())} />

                {/* Buchungsoption als visuelle Karten */}
                {isTwoDay ? (
                  <section>
                    <div className="label">Ich melde mich an für *</div>
                    <div className="space-y-2">
                      <OptionCard
                        name="dayOption"
                        value="BOTH"
                        defaultChecked
                        title="Beide Tage (Kombi)"
                        subtitle={`${day1} - ${day2}`}
                        price={formatEUR(priceBoth)}
                        highlight
                      />
                      <OptionCard
                        name="dayOption"
                        value="DAY_1"
                        title="Nur Tag 1"
                        subtitle={day1 ?? ""}
                        price={formatEUR(priceDay1)}
                      />
                      <OptionCard
                        name="dayOption"
                        value="DAY_2"
                        title="Nur Tag 2"
                        subtitle={day2 ?? ""}
                        price={formatEUR(priceDay2)}
                      />
                    </div>
                  </section>
                ) : (
                  <section className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                    <div className="text-xs uppercase tracking-wide text-brand-700 font-semibold mb-1">
                      Termin
                    </div>
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <div className="font-medium">{day1 ?? "noch offen"}</div>
                      {singlePrice > 0 && (
                        <div className="text-sm">
                          <span className="font-semibold">{formatEUR(singlePrice)}</span>
                          <span className="text-slate-500 ml-1">zzgl. 19 % MwSt.</span>
                        </div>
                      )}
                    </div>
                    <input type="hidden" name="dayOption" value="DAY_1" />
                  </section>
                )}

                {/* Persoenliche Daten */}
                <section className="space-y-3">
                  <div className="label">Ihre Daten</div>
                  <Field name="name" label="Nachname, Vorname" required />
                  <Field name="company" label="Firma / Arbeitgeber" required />
                  <Field name="street" label="Straße, Hausnummer" />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Field name="zip" label="PLZ" bare />
                    </div>
                    <div className="col-span-2">
                      <Field name="city" label="Ort" bare />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field name="phone" label="Telefon" />
                    <Field name="email" label="E-Mail-Adresse" type="email" required />
                  </div>
                </section>

                {/* Rechnung */}
                <section className="space-y-3">
                  <div className="label">Rechnung</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field name="billingEmail" label="E-Mail (Rechnungsadresse)" type="email" />
                    <Field name="costCenter" label="Kostenstelle" labelSuffix="(optional)" />
                  </div>
                </section>

                {turnstileKey && (
                  <div>
                    <div className="cf-turnstile" data-sitekey={turnstileKey} data-theme="light" />
                    <Script
                      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                      strategy="afterInteractive"
                      async
                      defer
                    />
                  </div>
                )}

                <label className="flex items-start gap-2 text-sm">
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
                      Datenschutzerklärung
                    </a>{" "}
                    gelesen und bin damit einverstanden, dass meine Daten zur Bearbeitung
                    meiner Anmeldung verwendet werden.
                  </span>
                </label>

                <button className="btn-primary w-full text-base py-3">Jetzt verbindlich anmelden</button>
              </form>

              {basePriceCents(ev.training, defaultDay) > 0 && (
                <p className="mt-4 text-xs text-slate-500 text-center">
                  Alle Preise zzgl. 19 % MwSt. Die Rechnung wird Ihnen nach der Anmeldung zugesandt.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OptionCard({
  name,
  value,
  title,
  subtitle,
  price,
  defaultChecked,
  highlight,
}: {
  name: string;
  value: string;
  title: string;
  subtitle: string;
  price: string;
  defaultChecked?: boolean;
  highlight?: boolean;
}) {
  return (
    <label className="block">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
        required
      />
      <div
        className={
          "rounded-xl border bg-white p-4 cursor-pointer transition " +
          "border-slate-200 hover:border-brand-300 " +
          "peer-checked:border-brand-500 peer-checked:ring-2 peer-checked:ring-brand-500/30 peer-checked:bg-brand-50/60"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{title}</span>
              {highlight && (
                <span className="badge bg-brand-100 text-brand-700">empfohlen</span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
          </div>
          <div className="text-right whitespace-nowrap">
            <div className="font-semibold">{price}</div>
            <div className="text-[10px] text-slate-500">zzgl. 19 % MwSt.</div>
          </div>
        </div>
      </div>
    </label>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  labelSuffix,
  bare,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  labelSuffix?: string;
  bare?: boolean;
}) {
  return (
    <div>
      {!bare && (
        <label className="label">
          {label}
          {required ? <span className="text-brand-600"> *</span> : null}
          {labelSuffix ? <span className="text-slate-400 font-normal"> {labelSuffix}</span> : null}
        </label>
      )}
      <input
        name={name}
        type={type}
        required={required}
        className="input"
        placeholder={label}
      />
    </div>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "captcha":
      return "Bitte bestätige, dass du kein Bot bist.";
    case "missing":
      return "Bitte alle Pflichtfelder ausfüllen.";
    case "duplicate":
      return "Es liegt bereits eine Anmeldung mit dieser E-Mail-Adresse für diese Veranstaltung vor.";
    case "full":
      return "Diese Veranstaltung ist leider ausgebucht.";
    default:
      return "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.";
  }
}
