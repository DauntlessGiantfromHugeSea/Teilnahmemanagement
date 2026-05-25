import type { Event, Training, EventFormat } from "@prisma/client";
import { EventDaysPicker } from "./EventDaysPicker";

interface Props {
  event?: Event;
  training?: Training;
  action: string;
  allowAddAnother?: boolean;
}

function dateInputValue(d?: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  return x.toISOString().slice(0, 10);
}

function eurInputValue(cents?: number | null) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function parseExtraDays(json?: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function EventForm({ event, training, action, allowAddAnother }: Props) {
  const format: EventFormat = event?.format ?? "PRESENCE";
  const isTwoDay = !!event?.day2Date;
  const initialDates: (string | null)[] = [
    dateInputValue(event?.day1Date) || null,
    dateInputValue(event?.day2Date) || null,
    ...parseExtraDays(event?.extraDays).map((s) => s),
  ];

  return (
    <form
      method="post"
      action={action}
      encType="multipart/form-data"
      className="event-form space-y-8"
    >
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-800">1. Format</h2>
          <p className="text-xs text-slate-500">Wie findet die Veranstaltung statt?</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <input
              type="radio"
              name="format"
              value="PRESENCE"
              defaultChecked={format === "PRESENCE"}
              className="peer sr-only"
            />
            <div className="card p-4 cursor-pointer peer-checked:ring-2 peer-checked:ring-brand-500 peer-checked:bg-brand-50">
              <div className="text-sm font-semibold">Schulung vor Ort</div>
              <div className="text-xs text-slate-500 mt-1">
                Präsenztermin mit Adresse, optional über zwei Tage.
              </div>
            </div>
          </label>
          <label className="block">
            <input
              type="radio"
              name="format"
              value="WEBINAR"
              defaultChecked={format === "WEBINAR"}
              className="peer sr-only"
            />
            <div className="card p-4 cursor-pointer peer-checked:ring-2 peer-checked:ring-brand-500 peer-checked:bg-brand-50">
              <div className="text-sm font-semibold">Webinar (online)</div>
              <div className="text-xs text-slate-500 mt-1">
                Online-Veranstaltung mit Meeting-Link, meist eintägig.
              </div>
            </div>
          </label>
        </div>
        {/* Anzahl Tage wird im Termine-Block unten gewaehlt (1..10). */}
        <input
          type="hidden"
          name="duration"
          value={isTwoDay ? "TWO" : "ONE"}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">2. Inhalt</h2>
          <p className="text-xs text-slate-500">Titel, Beschreibung und Preise.</p>
        </div>
        <div>
          <label className="label">Titel der Veranstaltung *</label>
          <input
            name="title"
            required
            defaultValue={event?.title ?? ""}
            placeholder="z. B. Basisschulung + Technologieschulung Geoponton, März 2026"
            className="input"
          />
        </div>
        <div>
          <label className="label">Beschreibung</label>
          <textarea
            name="description"
            rows={3}
            defaultValue={event?.description ?? training?.description ?? ""}
            placeholder="Inhalt, Zielgruppe, Besonderheiten ..."
            className="input"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Preis Tag 1 (EUR)</label>
            <input
              name="priceDay1"
              type="number"
              step="0.01"
              min="0"
              defaultValue={eurInputValue(training?.priceDay1) || "0"}
              className="input"
            />
          </div>
          <div className="only-twoday">
            <label className="label">Preis Tag 2 (EUR)</label>
            <input
              name="priceDay2"
              type="number"
              step="0.01"
              min="0"
              defaultValue={eurInputValue(training?.priceDay2) || "0"}
              className="input"
            />
          </div>
          <div className="only-twoday">
            <label className="label">Preis beide Tage (EUR)</label>
            <input
              name="priceBoth"
              type="number"
              step="0.01"
              min="0"
              defaultValue={eurInputValue(training?.priceBoth) || "0"}
              className="input"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Bei Webinaren / 1-Tag-Schulungen reicht der Preis Tag 1 als Gesamtpreis.
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">3. Termin</h2>
          <p className="text-xs text-slate-500">Datum und Uhrzeit der Durchführung.</p>
        </div>
        <EventDaysPicker initialDates={initialDates} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Beginn (täglich)</label>
            <input name="startTime" type="time" defaultValue={event?.startTime ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Ende (täglich)</label>
            <input name="endTime" type="time" defaultValue={event?.endTime ?? ""} className="input" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">4. Ort &amp; Zugang</h2>
        </div>
        <div className="only-presence">
          <label className="label">Veranstaltungsort</label>
          <input
            name="location"
            defaultValue={event?.location ?? ""}
            placeholder="Adresse oder Raum, z. B. FB-Akademie, Musterstr. 1, Berlin"
            className="input"
          />
        </div>
        <div className="only-webinar">
          <label className="label">Meeting-Link</label>
          <input
            name="meetingUrl"
            type="url"
            defaultValue={event?.meetingUrl ?? ""}
            placeholder="https://..."
            className="input"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">5. Öffentliche Anmeldeseite</h2>
          <p className="text-xs text-slate-500">
            Optionale Felder, die das Aussehen der öffentlichen Anmeldeseite
            (<code className="text-[11px]">/anmeldung/{`<id>`}</code>) anpassen.
          </p>
        </div>
        <div>
          <label className="label">Untertitel / Kicker</label>
          <input
            name="subtitle"
            defaultValue={event?.subtitle ?? ""}
            placeholder="z. B. Einführung ins Flüssigbodenverfahren"
            className="input"
          />
        </div>
        <div>
          <label className="label">Hero-Bild</label>
          {event?.heroImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.heroImageUrl}
              alt=""
              className="mb-2 h-32 w-full object-cover rounded-lg border border-slate-200"
            />
          )}
          <input
            type="file"
            name="heroImageFile"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="input"
          />
          <input type="hidden" name="heroImageUrl" defaultValue={event?.heroImageUrl ?? ""} />
          <p className="text-xs text-slate-500 mt-1">
            JPEG, PNG, WEBP, GIF oder SVG. Max. 8 MB. Querformat empfohlen (1600×600).
            {event?.heroImageUrl && " Eine neue Datei ersetzt das aktuelle Bild."}
          </p>
        </div>
        <div>
          <label className="label">Eigenes Logo (optional)</label>
          {event?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.logoUrl}
              alt=""
              className="mb-2 h-12 w-auto rounded border border-slate-200 bg-white p-1"
            />
          )}
          <input
            type="file"
            name="logoFile"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="input"
          />
          <input type="hidden" name="logoUrl" defaultValue={event?.logoUrl ?? ""} />
          <p className="text-xs text-slate-500 mt-1">
            Leer lassen für das Standard-Logo. PNG/SVG mit transparentem Hintergrund empfohlen.
          </p>
        </div>
        <div>
          <label className="label">Ausführliche Beschreibung</label>
          <textarea
            name="longDescription"
            rows={5}
            defaultValue={event?.longDescription ?? ""}
            placeholder="Wer sollte teilnehmen, was wird vermittelt, etc."
            className="input"
          />
        </div>
        <div>
          <label className="label">Programm / Bullet-Punkte</label>
          <textarea
            name="agenda"
            rows={5}
            defaultValue={event?.agenda ?? ""}
            placeholder="Ein Punkt pro Zeile, z. B.:&#10;Grundlagen Flüssigboden&#10;Praxiseinsatz Geoponton&#10;Q&amp;A mit Referent"
            className="input"
          />
          <p className="text-xs text-slate-500 mt-1">
            Wird als Liste mit Häkchen-Icons unter dem Hero-Bild dargestellt.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">6. Kapazität &amp; Interne Notizen</h2>
        </div>
        <div>
          <label className="label">Max. Teilnehmerzahl</label>
          <input
            name="capacity"
            type="number"
            min={1}
            defaultValue={event?.capacity ?? ""}
            placeholder="z. B. 20"
            className="input max-w-xs"
          />
          <p className="text-xs text-slate-500 mt-1">Leer lassen für unbegrenzt.</p>
        </div>
        <div>
          <label className="label">Interne Notizen</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Nur intern sichtbar, verschlüsselt gespeichert."
            className="input"
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
        <button name="next" value="detail" className="btn-primary">Speichern</button>
        {allowAddAnother && (
          <button name="next" value="another" className="btn-secondary">
            Speichern &amp; weitere anlegen
          </button>
        )}
      </div>
    </form>
  );
}
