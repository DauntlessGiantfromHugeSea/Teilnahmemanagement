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

export const BADGE_TEMPLATES: BadgeTemplate[] = [
  {
    id: "L4787",
    name: "Avery L4787",
    description: "Namensschilder 80 × 50 mm, 10 pro Bogen (2 × 5)",
    page: A4,
    margins: { top: 12.6, right: 7.9, bottom: 12.3, left: 19.7 },
    cols: 2,
    rows: 5,
    labelW: 80,
    labelH: 50,
    colGap: 15,
    rowGap: 5,
  },
];

export function getBadgeTemplate(id: string): BadgeTemplate | null {
  return BADGE_TEMPLATES.find((t) => t.id === id) ?? null;
}
