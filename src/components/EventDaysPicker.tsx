"use client";

import { useState } from "react";

interface Props {
  initialDates: (string | null)[]; // YYYY-MM-DD oder null pro Tag, in Reihenfolge
}

const MIN_DAYS = 1;
const MAX_DAYS = 10;

// Picker fuer 1..10 Tages-Termine.
// - Erster und zweiter Tag werden weiterhin als day1Date / day2Date gepostet
//   (Backwards-Kompatibilitaet).
// - Tage ab dem dritten werden als JSON-Array via versteckten 'extraDays'-Input
//   uebertragen.
export function EventDaysPicker({ initialDates }: Props) {
  const init = initialDates.filter((d) => d && d.length > 0) as string[];
  const initial = init.length || MIN_DAYS;
  const [count, setCount] = useState<number>(Math.max(MIN_DAYS, Math.min(MAX_DAYS, initial)));
  const [dates, setDates] = useState<string[]>(() => {
    const arr = [...init];
    while (arr.length < MAX_DAYS) arr.push("");
    return arr.slice(0, MAX_DAYS);
  });

  function setDate(i: number, v: string) {
    setDates((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  // Extra-Tage als JSON serialisieren (Tage 3..count)
  const extraDays = dates.slice(2, count).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const extraDaysJson = extraDays.length ? JSON.stringify(extraDays) : "";

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Anzahl Tage</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(MIN_DAYS, c - 1))}
            className="btn-row"
            aria-label="Weniger Tage"
          >
            −
          </button>
          <input
            type="number"
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={count}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setCount(Math.max(MIN_DAYS, Math.min(MAX_DAYS, v)));
            }}
            className="input w-20 text-center"
          />
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(MAX_DAYS, c + 1))}
            className="btn-row"
            aria-label="Mehr Tage"
          >
            +
          </button>
          <span className="text-xs text-slate-500">1–{MAX_DAYS}</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {Array.from({ length: count }, (_, i) => {
          // i=0 → day1Date, i=1 → day2Date, i>=2 → in extraDays JSON
          const name = i === 0 ? "day1Date" : i === 1 ? "day2Date" : `day${i + 1}_input`;
          return (
            <div key={i}>
              <label className="label">Tag {i + 1}</label>
              <input
                type="date"
                name={name}
                value={dates[i] ?? ""}
                onChange={(e) => setDate(i, e.target.value)}
                className="input"
              />
            </div>
          );
        })}
      </div>

      {/* Verstecktes Feld fuer alle Tage ab 3 als JSON */}
      <input type="hidden" name="extraDays" value={extraDaysJson} />
      {/* Ein verstecktes day2Date, falls count=1, damit Server day2Date=null setzt */}
      {count < 2 && <input type="hidden" name="day2Date" value="" />}
    </div>
  );
}
