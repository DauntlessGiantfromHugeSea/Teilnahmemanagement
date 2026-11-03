// Prueft die Formularauswertung der Kompetenzfeld-Verwaltung.
// Reine Funktion, keine Datenbank, kein Next.js:
//   npx tsx scripts/test-kompetenzfelder.ts
import { parseKompetenzfelderForm, type KompetenzfeldFormRow } from "@/lib/kompetenzfelder";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}${ok ? "" : `\n       erwartet: ${want}\n       erhalten: ${got}`}`);
};
const row = (id: string, label = "L", text = "T"): KompetenzfeldFormRow => ({ id, label, text });
const leer = (): KompetenzfeldFormRow => ({ id: "", label: "", text: "" });
const err = (r: ReturnType<typeof parseKompetenzfelderForm>) => ("error" in r ? r.error : "");
const ids = (r: ReturnType<typeof parseKompetenzfelderForm>) =>
  "items" in r ? r.items.map((i) => i.id).join(",") : "FEHLER";

// --- Normalfall: leere Neu-Zeile wird uebersprungen ---
check("leere Neu-Zeile ignoriert", ids(parseKompetenzfelderForm([row("I"), row("II"), leer()])), "I,II");

// --- Neues Feld anlegen ---
const neu = parseKompetenzfelderForm([
  row("I"), row("II"),
  { id: "V.IX", label: "V. IX. Personal Anwendung (Erdkabel)", text: "wird bestätigt, …" },
]);
check("neues Feld uebernommen", ids(neu), "I,II,V.IX");
check("Bezeichnung erhalten",
  "items" in neu ? neu.items[2].label : "", "V. IX. Personal Anwendung (Erdkabel)");

// --- Loeschen ---
check("loeschen entfernt genau eines",
  ids(parseKompetenzfelderForm([row("I"), row("II"), row("III"), leer()], "II")), "I,III");
check("loeschen einer unbekannten ID aendert nichts",
  ids(parseKompetenzfelderForm([row("I"), row("II")], "ZZZ")), "I,II");
check("letztes Feld laesst sich nicht loeschen",
  err(parseKompetenzfelderForm([row("I")], "I")).includes("mindestens ein Kompetenzfeld"), true);

// --- Gleichzeitige Textaenderung beim Loeschen bleibt erhalten ---
const gleichzeitig = parseKompetenzfelderForm(
  [{ id: "I", label: "Neu benannt", text: "Neuer Text" }, row("II")], "II");
check("Textaenderung ueberlebt das Loeschen",
  "items" in gleichzeitig ? gleichzeitig.items[0].label : "", "Neu benannt");

// --- Fehlerfaelle ---
check("halb ausgefuellt abgelehnt",
  err(parseKompetenzfelderForm([row("I"), { id: "V.X", label: "", text: "" }])).includes("alle drei Pflicht"), true);
check("fehlende ID abgelehnt",
  err(parseKompetenzfelderForm([row("I"), { id: "", label: "L", text: "T" }])).includes("alle drei Pflicht"), true);
check("doppelte ID abgelehnt",
  err(parseKompetenzfelderForm([row("I"), row("I")])).includes("doppelt vergeben"), true);
check("doppelte ID auch bei anderer Schreibweise",
  err(parseKompetenzfelderForm([row("v.ix"), row("V.IX")])).includes("doppelt vergeben"), true);
check("alles leer abgelehnt",
  err(parseKompetenzfelderForm([leer(), leer()])).includes("mindestens ein Kompetenzfeld"), true);

// --- ID-Format ---
for (const gut of ["I", "V.IX", "V-IX", "A_1", "VIII", "x9"]) {
  check(`ID "${gut}" erlaubt`, ids(parseKompetenzfelderForm([row(gut)])), gut);
}
for (const schlecht of [".X", "X.", "V IX", "V/IX", "-A", "A-"]) {
  check(`ID "${schlecht}" abgelehnt`,
    err(parseKompetenzfelderForm([row(schlecht)])).includes("keine gültige ID"), true);
}

// --- Leerraum wird getrimmt ---
const getrimmt = parseKompetenzfelderForm([{ id: "  V.IX  ", label: "  L  ", text: "  T  " }]);
check("ID getrimmt", "items" in getrimmt ? getrimmt.items[0].id : "", "V.IX");
check("Bezeichnung getrimmt", "items" in getrimmt ? getrimmt.items[0].label : "", "L");

console.log(fails === 0 ? "\nALLE TESTS OK" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
