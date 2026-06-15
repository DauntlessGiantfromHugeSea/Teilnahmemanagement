// Registry der Namensschild-Vorlagen. Erweiterbar: neue Vorlagen einfach
// hier ergaenzen, alle Werte in MILLIMETER (werden bei PDF-Erstellung in
// Punkt umgerechnet). Anschliessend in der UI im Dropdown sichtbar.

export interface BadgeTemplate {
  id: string;
  name: string;
  description?: string;
  page: { w: number; h: number };           // mm (Default A4)
  margins: { top: number; right: number; bottom: number; left: number }; // mm
  cols: number;
  rows: number;
  labelW: number;
  labelH: number;
  colGap: number;
  rowGap: number;
}

export const A4 = { w: 210, h: 297 };

// HERMA "Schilder Namensschilder zum Einstecken/Anstecken" — Standard ist
// 75 × 40 mm (10 Stueck/Bogen, 2 × 5), bzw. 90 × 60 mm (8 Stueck/Bogen,
// 2 × 4). Margins entsprechen den HERMA-Vorlagen im Word.
export const BADGE_TEMPLATES: BadgeTemplate[] = [
  {
    id: "HERMA4513",
    name: "HERMA 4513 / Avery L4787",
    description: "Namensschilder 80 × 50 mm, 10 pro Bogen (2 × 5)",
    page: A4,
    margins: { top: 21.5, right: 15, bottom: 21.5, left: 15 },
    cols: 2,
    rows: 5,
    labelW: 80,
    labelH: 50,
    colGap: 20,
    rowGap: 0,
  },
  {
    id: "HERMA5028",
    name: "HERMA 5028 / 4452",
    description: "Namensschilder 90 × 60 mm, 8 pro Bogen (2 × 4)",
    page: A4,
    // Layout symmetrisch: 13 + 90 + 4 + 90 + 13 = 210 mm. colGap = 4 mm
    // entspricht der Perforation zwischen den Spalten, sodass weder die
    // linke noch die rechte Spalte auf der Bruchkante haengt.
    margins: { top: 28.5, right: 13, bottom: 28.5, left: 13 },
    cols: 2,
    rows: 4,
    labelW: 90,
    labelH: 60,
    colGap: 4,
    rowGap: 0,
  },
  {
    id: "HERMA4419",
    name: "HERMA 4419",
    description: "Namensschilder 75 × 40 mm, 18 pro Bogen (3 × 6)",
    page: A4,
    margins: { top: 28.5, right: 7.5, bottom: 28.5, left: 7.5 },
    cols: 3,
    rows: 6,
    labelW: 65,
    labelH: 40,
    colGap: 0,
    rowGap: 0,
  },
];

export function getBadgeTemplate(id: string): BadgeTemplate | null {
  return BADGE_TEMPLATES.find((t) => t.id === id) ?? null;
}
