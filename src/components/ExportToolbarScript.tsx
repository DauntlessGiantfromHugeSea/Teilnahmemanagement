"use client";
import { useEffect } from "react";

// Klein & serverkompatibel: bindet Click-Handler an die Alle/Keine/Standard-
// Buttons und die Radio-Modus-Umschaltung im Export-Formular.
export function ExportToolbarScript() {
  useEffect(() => {
    const form = document.querySelector("form[data-export-form]") as HTMLFormElement | null;
    if (!form) return;

    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const a = t.getAttribute("data-action");
      if (!a) return;
      e.preventDefault();
      const boxes = (sel: string) =>
        Array.from(form.querySelectorAll<HTMLInputElement>(sel));
      if (a === "evt-all" || a === "evt-none") {
        boxes("input.export-evt").forEach((b) => (b.checked = a === "evt-all"));
      } else if (a === "fld-all" || a === "fld-none") {
        boxes("input.export-fld").forEach((b) => (b.checked = a === "fld-all"));
      } else if (a === "fld-default") {
        boxes("input.export-fld").forEach((b) => (b.checked = b.getAttribute("data-default") === "1"));
      }
    };

    const syncMode = () => {
      const sel = form.querySelector<HTMLInputElement>("input.mode-radio:checked");
      const mode = sel?.getAttribute("data-mode") ?? "download";
      form.querySelectorAll<HTMLElement>(".email-fields").forEach((el) => {
        if (mode === "email") el.classList.remove("hidden");
        else el.classList.add("hidden");
      });
      const toInput = form.querySelector<HTMLInputElement>('input[name="to"]');
      if (toInput) toInput.required = mode === "email";
    };

    const onChange = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.classList.contains("mode-radio")) syncMode();
    };

    form.addEventListener("click", onClick);
    form.addEventListener("change", onChange);
    syncMode();
    return () => {
      form.removeEventListener("click", onClick);
      form.removeEventListener("change", onChange);
    };
  }, []);
  return null;
}
