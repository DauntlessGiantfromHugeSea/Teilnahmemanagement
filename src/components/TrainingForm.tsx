import type { Training } from "@prisma/client";

export function TrainingForm({ training, action }: { training?: Training; action: string }) {
  const eur = (cents?: number) => ((cents ?? 0) / 100).toFixed(2);
  return (
    <form method="post" action={action} className="space-y-4">
      <div>
        <label className="label">Titel</label>
        <input name="title" required defaultValue={training?.title ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Beschreibung</label>
        <textarea name="description" defaultValue={training?.description ?? ""} className="input" rows={3} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Preis Tag 1 (EUR)</label>
          <input name="priceDay1" type="number" step="0.01" min="0" required defaultValue={eur(training?.priceDay1)} className="input" />
        </div>
        <div>
          <label className="label">Preis Tag 2 (EUR)</label>
          <input name="priceDay2" type="number" step="0.01" min="0" required defaultValue={eur(training?.priceDay2)} className="input" />
        </div>
        <div>
          <label className="label">Preis beide Tage (EUR)</label>
          <input name="priceBoth" type="number" step="0.01" min="0" required defaultValue={eur(training?.priceBoth)} className="input" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={training?.active ?? true} />
        Aktiv (fuer neue Veranstaltungen waehlbar)
      </label>
      <button className="btn-primary">Speichern</button>
    </form>
  );
}
