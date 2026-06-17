import { notFound } from "next/navigation";
import Script from "next/script";
/* eslint-disable @next/next/no-img-element */
import { prisma } from "@/lib/db";
import { basePriceCents, formatEUR } from "@/lib/pricing";
import { parseBlocks, type Block } from "@/lib/pageBlocks";
import { DayOption } from "@prisma/client";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
  searchParams: { error?: string; day?: string; embed?: string };
}

export default async function AnmeldungPage({ params, searchParams }: Props) {
  const embed = searchParams.embed === "1" || searchParams.embed === "form";
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
  const fmtShort = (d?: Date | null) =>
    d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  const day1 = fmt(ev.day1Date);
  const day2 = fmt(ev.day2Date);
  const dateBadge = ev.day2Date && day1 && day2 ? `${fmtShort(ev.day1Date)} – ${fmtShort(ev.day2Date)}` : (fmtShort(ev.day1Date) ?? "Termin offen");

  const isTwoDay = !!ev.day2Date;
  const priceDay1 = basePriceCents(ev.training, "DAY_1");
  const priceDay2 = basePriceCents(ev.training, "DAY_2");
  const priceBoth = basePriceCents(ev.training, "BOTH");
  const singlePrice = basePriceCents(ev.training, "DAY_1");

  const agendaItems = (ev.agenda ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const blocks = parseBlocks(ev.pageBlocks);

  return (
    <div className="min-h-screen bg-transparent">
      {/* Hero in voller Breite (im Embed-Modus ausgeblendet) */}
      {!embed && (ev.heroImageUrl ? (
        <div className="relative w-full bg-brand-900 aspect-[21/9] sm:aspect-[21/8] max-h-[60vh] overflow-hidden">
          <img
            src={ev.heroImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <img
            src={ev.logoUrl || "/logo-fba.png"}
            alt="Logo"
            className="absolute top-4 right-4 sm:top-6 sm:right-6 h-10 sm:h-14 w-auto bg-white/95 rounded-lg p-2 shadow-lg"
          />
          <div className="absolute left-0 right-0 bottom-0">
            <div className="max-w-5xl mx-auto px-4 sm:px-8 pb-8 sm:pb-12 text-white">
              <div className="fba-pill mb-4">{dateBadge}</div>
              {ev.subtitle && (
                <div className="text-xs sm:text-sm uppercase tracking-[0.2em] opacity-90 mb-2">
                  {ev.subtitle}
                </div>
              )}
              <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight max-w-3xl drop-shadow">
                {ev.title}
              </h1>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative w-full fba-hero text-white overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-20">
            <img
              src={ev.logoUrl || "/logo-fba.png"}
              alt="Logo"
              className="absolute top-6 right-6 h-12 w-auto bg-white/95 rounded-lg p-2"
            />
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/95 text-brand-700 px-3 py-1 text-xs font-semibold mb-3 sm:mb-4">
              {dateBadge}
            </div>
            {ev.subtitle && (
              <div className="text-xs sm:text-sm uppercase tracking-[0.2em] opacity-90 mb-2">
                {ev.subtitle}
              </div>
            )}
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight max-w-3xl">{ev.title}</h1>
          </div>
        </div>
      ))}

      <div className={`w-full max-w-3xl mx-auto ${embed ? "px-0 py-0" : "px-4 py-6 sm:py-10"}`}>
        {!embed && (<>
        {/* Meta-Leiste als eigene Karte */}
        <div className="card -mt-12 sm:-mt-16 relative z-10">
          <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Meta icon="cal" label={day2 ? `${day1} – ${day2}` : day1 ?? "Termin folgt"} />
            {(ev.startTime || ev.endTime) && (
              <Meta
                icon="clock"
                label={`${ev.startTime ?? "?"}${ev.endTime ? ` – ${ev.endTime}` : ""} Uhr`}
              />
            )}
            <Meta
              icon={ev.format === "WEBINAR" ? "online" : "place"}
              label={ev.format === "WEBINAR" ? "Online (Webinar)" : ev.location ?? "Ort folgt"}
            />
            <Meta icon="shield" label="SSL-verschlüsselt" />
          </div>
        </div>

        {(isPast || isFull) ? (
          <div className="card mt-6 p-8 text-center">
            <h2 className="text-lg font-semibold mb-2">
              {isPast ? "Anmeldung geschlossen" : "Veranstaltung ausgebucht"}
            </h2>
            <p className="text-sm text-slate-600">
              {isPast
                ? "Diese Veranstaltung hat bereits stattgefunden."
                : "Diese Veranstaltung ist leider voll belegt."}
            </p>
          </div>
        ) : (
          <>
            {/* Custom Page-Blocks (Baukasten) */}
            {blocks.length > 0 && (
              <div className="card mt-6 p-6 sm:p-8 space-y-5">
                {blocks.map((b) => <BlockRender key={b.id} block={b} />)}
              </div>
            )}

            {/* Inhalt: Beschreibung + Agenda */}
            {(ev.longDescription || agendaItems.length > 0) && (
              <div className="card mt-6 p-6 sm:p-8 space-y-5">
                {ev.longDescription && (
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                    {ev.longDescription}
                  </p>
                )}
                {agendaItems.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-700 mb-3">
                      Programm
                    </h3>
                    <ul className="space-y-2">
                      {agendaItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <svg className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="text-slate-700">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
        </>)}

            {/* Formular */}
            <div className={embed ? "p-4 sm:p-6" : "card mt-6 p-6 sm:p-8"}>
              <h2 className="text-lg font-semibold mb-1">Verbindliche Anmeldung</h2>
              <p className="text-sm text-slate-500 mb-6">
                Ihre Daten werden verschlüsselt übertragen.
              </p>

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

                {isTwoDay ? (
                  <section>
                    <div className="label">Ich melde mich an für *</div>
                    <div className="space-y-2">
                      <OptionCard
                        name="dayOption"
                        value="BOTH"
                        defaultChecked
                        title="Beide Tage (Kombi)"
                        subtitle={`${day1} – ${day2}`}
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
                ) : singlePrice > 0 ? (
                  <section className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                    <div className="text-xs uppercase tracking-wide text-brand-700 font-semibold mb-1">
                      Termin
                    </div>
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <div className="font-medium">{day1 ?? "noch offen"}</div>
                      <div className="text-sm">
                        <span className="font-semibold">{formatEUR(singlePrice)}</span>
                        <span className="text-slate-500 ml-1">zzgl. 19 % MwSt.</span>
                      </div>
                    </div>
                    <input type="hidden" name="dayOption" value="DAY_1" />
                  </section>
                ) : (
                  <input type="hidden" name="dayOption" value="DAY_1" />
                )}

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

                <button className="btn-primary w-full text-base py-3">
                  Jetzt verbindlich anmelden
                </button>
              </form>
            </div>
          </>
        )}

        {!embed && (
          <p className="text-center text-xs text-slate-400 mt-6 tracking-wider uppercase">
            Flüssigboden Akademie
          </p>
        )}
      </div>
    </div>
  );
}

function BlockRender({ block: b }: { block: Block }) {
  if (b.type === "hero") {
    return (
      <div>
        {b.title && <h2 className="text-xl font-semibold text-slate-800">{b.title}</h2>}
        {b.text && <p className="text-sm text-slate-500 mt-1">{b.text}</p>}
      </div>
    );
  }
  if (b.type === "text") {
    return <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{b.text}</p>;
  }
  if (b.type === "image" && b.url) {
    return (
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.url} alt={b.text ?? ""} className="w-full rounded-lg border border-slate-200" />
        {b.text && <figcaption className="text-xs text-slate-500 mt-1 text-center">{b.text}</figcaption>}
      </figure>
    );
  }
  if (b.type === "button") {
    const cls = b.variant === "secondary" ? "btn-secondary" : "btn-primary";
    return (
      <div>
        <a href={b.href ?? "#"} className={cls + " inline-flex"}>{b.title ?? "Klick"}</a>
      </div>
    );
  }
  if (b.type === "list" && b.items && b.items.length > 0) {
    return (
      <ul className="space-y-2">
        {b.items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <svg className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-slate-700">{it}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (b.type === "divider") {
    return <hr className="border-slate-200" />;
  }
  return null;
}

function Meta({ icon, label }: { icon: "cal" | "clock" | "place" | "online" | "shield"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600">
      <Icon name={icon} className="h-4 w-4 text-brand-500" />
      <span>{label}</span>
    </span>
  );
}

function Icon({ name, className }: { name: string; className: string }) {
  const paths: Record<string, React.ReactNode> = {
    cal: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </>
    ),
    place: (
      <>
        <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    online: (
      <>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      {paths[name]}
    </svg>
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
      <div className="rounded-xl border bg-white p-4 cursor-pointer transition border-slate-200 hover:border-brand-300 peer-checked:border-brand-500 peer-checked:ring-2 peer-checked:ring-brand-500/30 peer-checked:bg-brand-50/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{title}</span>
              {highlight && <span className="badge bg-brand-100 text-brand-700">empfohlen</span>}
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
