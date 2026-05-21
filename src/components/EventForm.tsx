import type { Event, Training } from "@prisma/client";

interface Props {
  event?: Event;
  trainings: Training[];
  action: string;
  allowAddAnother?: boolean;
}

function dateInputValue(d?: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  return x.toISOString().slice(0, 10);
}

export function EventForm({ event, trainings, action, allowAddAnother }: Props) {
  return (
    <form method="post" action={action} className="space-y-4">
      <div>
        <label className="label">Titel</label>
        <input name="title" required defaultValue={event?.title ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Schulung</label>
        <select name="trainingId" required defaultValue={event?.trainingId ?? ""} className="input">
          <option value="" disabled>Bitte waehlen</option>
          {trainings.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tag 1</label>
          <input name="day1Date" type="date" defaultValue={dateInputValue(event?.day1Date)} className="input" />
        </div>
        <div>
          <label className="label">Tag 2</label>
          <input name="day2Date" type="date" defaultValue={dateInputValue(event?.day2Date)} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Ort</label>
        <input name="location" defaultValue={event?.location ?? ""} className="input" />
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
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
