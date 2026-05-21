import type { DayOption, ParticipantStatus, Training } from "@prisma/client";

interface Decrypted {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  dayOption?: DayOption;
  discountBps?: number;
  status?: ParticipantStatus;
}

interface Props {
  action: string;
  training: Training;
  initial?: Decrypted;
}

export function ParticipantForm({ action, training, initial }: Props) {
  const eur = (c: number) => (c / 100).toFixed(2);
  return (
    <form method="post" action={action} className="space-y-6">
      <section className="space-y-4">
        <h3 className="font-semibold text-slate-700">Person</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Vorname</label>
            <input name="firstName" required defaultValue={initial?.firstName ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Nachname</label>
            <input name="lastName" required defaultValue={initial?.lastName ?? ""} className="input" />
          </div>
          <div>
            <label className="label">E-Mail</label>
            <input type="email" name="email" required defaultValue={initial?.email ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Telefon</label>
            <input name="phone" defaultValue={initial?.phone ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Firma</label>
            <input name="company" defaultValue={initial?.company ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Strasse + Nr.</label>
            <input name="street" defaultValue={initial?.street ?? ""} className="input" />
          </div>
          <div>
            <label className="label">PLZ</label>
            <input name="zip" defaultValue={initial?.zip ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Ort</label>
            <input name="city" defaultValue={initial?.city ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Land</label>
            <input name="country" defaultValue={initial?.country ?? "Deutschland"} className="input" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-semibold text-slate-700">Buchung</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <label className={"card p-3 cursor-pointer flex items-center gap-3 " + (initial?.dayOption === "DAY_1" ? "ring-2 ring-brand-500" : "")}>
            <input type="radio" name="dayOption" value="DAY_1" defaultChecked={initial?.dayOption === "DAY_1"} />
            <div>
              <div className="text-sm font-medium">Nur Tag 1</div>
              <div className="text-xs text-slate-500">{eur(training.priceDay1)} EUR</div>
            </div>
          </label>
          <label className={"card p-3 cursor-pointer flex items-center gap-3 " + (initial?.dayOption === "DAY_2" ? "ring-2 ring-brand-500" : "")}>
            <input type="radio" name="dayOption" value="DAY_2" defaultChecked={initial?.dayOption === "DAY_2"} />
            <div>
              <div className="text-sm font-medium">Nur Tag 2</div>
              <div className="text-xs text-slate-500">{eur(training.priceDay2)} EUR</div>
            </div>
          </label>
          <label className={"card p-3 cursor-pointer flex items-center gap-3 " + ((initial?.dayOption ?? "BOTH") === "BOTH" ? "ring-2 ring-brand-500" : "")}>
            <input type="radio" name="dayOption" value="BOTH" defaultChecked={(initial?.dayOption ?? "BOTH") === "BOTH"} />
            <div>
              <div className="text-sm font-medium">Beide Tage</div>
              <div className="text-xs text-slate-500">{eur(training.priceBoth)} EUR</div>
            </div>
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Rabatt in % (0 - 100)</label>
            <input
              name="discountPct"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={initial?.discountBps != null ? (initial.discountBps / 100).toString() : "0"}
              className="input"
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={initial?.status ?? "REGISTERED"} className="input">
              <option value="REGISTERED">Angemeldet</option>
              <option value="CONFIRMED">Bestaetigt</option>
              <option value="CANCELLED">Storniert</option>
              <option value="ATTENDED">Teilgenommen</option>
              <option value="NO_SHOW">Nicht erschienen</option>
            </select>
          </div>
        </div>
      </section>

      <section>
        <label className="label">Notizen</label>
        <textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} className="input" />
      </section>

      <button className="btn-primary">Speichern</button>
    </form>
  );
}
