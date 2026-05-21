import type { Event, Training, EventFormat } from "@prisma/client";

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

export function EventForm({ event, training, action, allowAddAnother }: Props) {
  const format: EventFormat = event?.format ?? "PRESENCE";
  const isTwoDay = !!event?.day2Date;

  return (
    <form method="post" action={action} className="event-form space-y-8">
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
        <div className="only-presence pt-2">
          <div className="text-xs text-slate-500 mb-2">Dauer</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <input
                type="radio"
                name="duration"
                value="ONE"
                defaultChecked={!isTwoDay}
                className="peer sr-only"
              />
              <div className="card p-3 cursor-pointer text-sm peer-checked:ring-2 peer-checked:ring-brand-500 peer-checked:bg-brand-50">
                <div className="font-semibold">1 Tag</div>
                <div className="text-xs text-slate-500 mt-0.5">Eintägige Schulung</div>
              </div>
            </label>
            <label className="block">
              <input
                type="radio"
                name="duration"
                value="TWO"
                defaultChecked={isTwoDay}
                className="peer sr-only"
              />
              <div className="card p-3 cursor-pointer text-sm peer-checked:ring-2 peer-checked:ring-brand-500 peer-checked:bg-brand-50">
                <div className="font-semibold">2 Tage</div>
                <div className="text-xs text-slate-500 mt-0.5">Termine an zwei Tagen</div>
              </div>
            </label>
          </div>
        </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Tag 1</label>
            <input name="day1Date" type="date" defaultValue={dateInputValue(event?.day1Date)} className="input" />
          </div>
          <div>
            <label className="label">Beginn</label>
            <input name="startTime" type="time" defaultValue={event?.startTime ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Ende</label>
            <input name="endTime" type="time" defaultValue={event?.endTime ?? ""} className="input" />
          </div>
        </div>
        <div className="only-twoday">
          <label className="label">Tag 2</label>
          <input name="day2Date" type="date" defaultValue={dateInputValue(event?.day2Date)} className="input max-w-xs" />
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
          <h2 className="font-semibold text-slate-800">5. Kapazität &amp; Notizen</h2>
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
