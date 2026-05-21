import type { Event, Training, EventFormat } from "@prisma/client";

interface Props {
  event?: Event;
  trainings: Training[];
  action: string;
  allowAddAnother?: boolean;
  allowInlineTraining?: boolean;
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

export function EventForm({ event, trainings, action, allowAddAnother, allowInlineTraining }: Props) {
  const format: EventFormat = event?.format ?? "PRESENCE";

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
                Praesenztermin mit Adresse, optional ueber zwei Tage.
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
                Online-Veranstaltung mit Meeting-Link, meist eintaegig.
              </div>
            </div>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">2. Grunddaten</h2>
          <p className="text-xs text-slate-500">Titel der Veranstaltung und Inhalt.</p>
        </div>
        <div>
          <label className="label">Titel der Veranstaltung *</label>
          <input
            name="title"
            required
            defaultValue={event?.title ?? ""}
            placeholder="z. B. Crashkurs Maerz 2026"
            className="input"
          />
        </div>
        <div>
          <label className="label">Kurzbeschreibung</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={event?.description ?? ""}
            placeholder="Inhalt, Zielgruppe, Besonderheiten ..."
            className="input"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">3. Schulung &amp; Preise</h2>
          <p className="text-xs text-slate-500">
            Bestimmt die Preise pro Buchungsoption. Du kannst eine bestehende Schulung
            verwenden oder direkt eine neue anlegen.
          </p>
        </div>

        {allowInlineTraining ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="radio"
                  name="trainingMode"
                  value="existing"
                  defaultChecked={trainings.length > 0}
                  className="peer sr-only training-mode"
                />
                <div className="card p-3 cursor-pointer text-sm peer-checked:ring-2 peer-checked:ring-brand-500 peer-checked:bg-brand-50">
                  Bestehende Schulung verwenden
                </div>
              </label>
              <label className="flex-1">
                <input
                  type="radio"
                  name="trainingMode"
                  value="new"
                  defaultChecked={trainings.length === 0}
                  className="peer sr-only training-mode"
                />
                <div className="card p-3 cursor-pointer text-sm peer-checked:ring-2 peer-checked:ring-brand-500 peer-checked:bg-brand-50">
                  Neue Schulung anlegen
                </div>
              </label>
            </div>

            <div className="training-existing">
              <label className="label">Schulung waehlen</label>
              <select name="trainingId" defaultValue={event?.trainingId ?? ""} className="input">
                <option value="" disabled>Bitte waehlen</option>
                {trainings.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            <div className="training-new space-y-4 rounded-lg border border-dashed border-slate-300 p-4">
              <div>
                <label className="label">Schulungstitel</label>
                <input
                  name="newTrainingTitle"
                  placeholder="z. B. Grundkurs Buchhaltung"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Schulungsbeschreibung</label>
                <textarea
                  name="newTrainingDescription"
                  rows={2}
                  placeholder="Was umfasst die Schulung?"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Preis Tag 1 (EUR)</label>
                  <input name="newTrainingPriceDay1" type="number" step="0.01" min="0" defaultValue="0" className="input" />
                </div>
                <div>
                  <label className="label">Preis Tag 2 (EUR)</label>
                  <input name="newTrainingPriceDay2" type="number" step="0.01" min="0" defaultValue="0" className="input" />
                </div>
                <div>
                  <label className="label">Preis beide Tage (EUR)</label>
                  <input name="newTrainingPriceBoth" type="number" step="0.01" min="0" defaultValue="0" className="input" />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Preise koennen spaeter unter &quot;Schulungen&quot; angepasst werden. Bei Webinaren reicht meist nur ein Preis.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Schulung *</label>
            <select name="trainingId" required defaultValue={event?.trainingId ?? ""} className="input">
              <option value="" disabled>Bitte waehlen</option>
              {trainings.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">4. Termin</h2>
          <p className="text-xs text-slate-500">Datum und Uhrzeit der Durchfuehrung.</p>
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
        <div className="only-presence">
          <label className="label">Tag 2 (optional)</label>
          <input name="day2Date" type="date" defaultValue={dateInputValue(event?.day2Date)} className="input max-w-xs" />
          <p className="text-xs text-slate-500 mt-1">
            Nur ausfuellen wenn die Schulung ueber zwei Tage geht.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">5. Ort &amp; Zugang</h2>
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
          <p className="text-xs text-slate-500 mt-1">
            Wird Teilnehmern in Bestaetigungen genutzt.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">6. Kapazitaet &amp; Notizen</h2>
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
          <p className="text-xs text-slate-500 mt-1">Leer lassen fuer unbegrenzt.</p>
        </div>
        <div>
          <label className="label">Interne Notizen</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Nur intern sichtbar, verschluesselt gespeichert."
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

export { eurInputValue };
