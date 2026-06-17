// Importiert die 12 Beispiel-Wissenstest-Fragen aus dem mitgelieferten PDF
// (Mischplatz, Bodenmanagement & Flüssigbodenherstellung). Idempotent:
// vorhandene Fragen mit identischem Text werden uebersprungen.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
import { prisma } from "@/lib/db";

interface Seed { text: string; options: string[]; correctIdx: number }

const SEED: Seed[] = [
  {
    text: "Was sind die minimalen Größenanforderungen an einen Mischplatz?",
    options: [
      "800 m² (größer bringt Ablaufvorteile)",
      "1000 m²",
      "1800 m²",
    ],
    correctIdx: 2,
  },
  {
    text: "Was sind die wesentlichen Bestandteile eines Flüssigboden-Mischplatzes?",
    options: [
      "Silos für Tonmineral und Zement, Flüssigbodenherstellungsanlage, Scheibenseparator, Mischfahrzeug, Radlader/Sauggbagger, Strom- und Wasseranschluss, Container für den Bauleiter",
      "Silos für Tonmineral und Zement, Flüssigbodenherstellungsanlage, Mischfahrzeug, Radlader/Bagger, Strom- und Wasseranschluss",
      "Silos für Tonmineral und Zement, Flüssigbodenherstellungsanlage, Scheibenseparator, Mischfahrzeug, Radlader/Bagger, Strom- und Wasseranschluss, Container für den Mischmeister",
    ],
    correctIdx: 2,
  },
  {
    text: "Wie können Mischplätze auch für Baustellen verwendet werden, bei denen keine Staubbelastung vorliegen darf?",
    options: [
      "Einhausung des Mischplatzes, ggf. Erweiterung um Staubabsaugung bei Übergabe der Trockenmischung in das Mischfahrzeug",
      "Vom Mischplatz bis zum Einbauort muss eine mobile Zeltanlage errichtet werden.",
      "Das geht nicht. Die Herstellung muss in ein Mischwerk ausgelagert werden.",
    ],
    correctIdx: 0,
  },
  {
    text: "Wie muss der Aushubboden vor der Herstellung von Flüssigboden, als Teil des Bodenmanagements beschaffen sein?",
    options: [
      "Zentrales Haufwerk bilden und aus diesem beliebig produzieren.",
      "Der Ausgangsboden muss rieselfähig sein oder mechanisch aufbereitet werden, um rieselfähig zu werden. Heterogene Böden sind zu homogenisieren.",
      "Es ist eine Korngrößenfraktionierung vorzunehmen.",
    ],
    correctIdx: 1,
  },
  {
    text: "Wie werden stark bindige Böden verarbeitbar gemacht?",
    options: [
      "Aufkalken und Homogenisierung",
      "Gar nicht, diese Böden werden entsorgt.",
      "Langfristige Lagerung und Austrocknung",
    ],
    correctIdx: 0,
  },
  {
    text: "Wie sind Zuschlagstoffe zu lagern?",
    options: [
      "Die Lagerung erfolgt vorzugsweise in Silos, die Lagerung kann auch in Big Bags erfolgen, wenn die Anlage über Kleinsilos bedient werden kann.",
      "Die Lagerung kann nur tagaktuell erfolgen und es werden täglich Zuschlagstoffe geliefert.",
      "Die Lagerung erfolgt in Form von Haufwerken, die bei Bedarf in die Silos geblasen werden.",
    ],
    correctIdx: 0,
  },
  {
    text: "Wofür muss ein Sicherheitsdatenblatt vorliegen?",
    options: [
      "Für die Mikrowelle und den Ausbreittisch",
      "Für den ausgehobenen Boden und das Trinkwasser",
      "Für die Zuschlagstoffe in den Silos – Zement, Compound und ggf. Kalk",
    ],
    correctIdx: 2,
  },
  {
    text: "Wie werden Sieblinien am einfachsten auf der Flüssigbodenbaustelle gesteuert?",
    options: [
      "Brecher",
      "Siebanlage",
      "Scheibenseparator",
    ],
    correctIdx: 2,
  },
  {
    text: "Was sind die wichtigsten Aufgaben der Technik bei der Homogenisierung?",
    options: [
      "Zerreißen der bindigen Bodenpartikel",
      "Sieben des Bodens und Zerkleinern der Bodenpartikelgröße, Ausseparieren der zu großen Steine aus dem Aushub, Herstellung einer rieselfähigen Matrix",
      "Brechen der im Boden enthaltenen Steine",
    ],
    correctIdx: 1,
  },
  {
    text: "Welche Daten muss das Personal Herstellung aus der Mischtechnik samt Steuerung gewinnen können?",
    options: [
      "Protokollierung der umgesetzten Rezeptur und der Chargen mit SOLL-IST-Angaben der Rezepturkomponenten; Ausgabe in Form eines Lieferscheines (LS); die Steuerung muss die gesamten Prozessdaten einseh- und abrufbar vorhalten.",
      "Die Stromverbräuche und Technikdaten der Herstellungstechnik müssen festgehalten werden.",
      "Die Geräuschsbelastung muss protokolliert werden, damit die BImSchG-Genehmigung nicht verfällt.",
    ],
    correctIdx: 0,
  },
  {
    text: "Welche Mess- und Dosiertechnik ist für die Herstellung von Flüssigboden erforderlich?",
    options: [
      "Handelsübliche Haushaltswaage zur Dosierung der Komponenten und zur Bestimmung der Eigenfeuchte des Ausgangsmaterials",
      "Stromzähler für die Stromabnahme, Fahrzeugwaagen",
      "Gravimetrisch und volumetrisch arbeitende Messung und Datenerfassung, Bandwaage mit Gewichtsintegration für Bodenerfassung, Behälterwaage für die Dosierung der Komponenten FBC und CEM und Durchflussmesser für Wasser",
    ],
    correctIdx: 2,
  },
  {
    text: "Wie wird die auf der Rezeptur vorgegebene Wassermenge zugegeben und unterteilt?",
    options: [
      "Wasser wird ausschließlich parallel als eine Menge zugegeben.",
      "In Vorwasser, in Parallelwasser und in Nachwasser",
      "Das Wasser wird erst im Fahrmischer zugegeben. Dort wird es zu drei Zeiten zugegeben, je nachdem, wie viel Mischgut bereits im Mischer ist.",
    ],
    correctIdx: 1,
  },
];

export async function POST(_req: Request) {
  const s = await getSession();
  if (!s || !canWriteGlobal(s)) return new NextResponse("Forbidden", { status: 403 });

  const existing = await prisma.wissenstestQuestion.findMany({ select: { text: true } });
  const known = new Set(existing.map((e) => e.text));

  let inserted = 0;
  for (let i = 0; i < SEED.length; i++) {
    const q = SEED[i];
    if (known.has(q.text)) continue;
    await prisma.wissenstestQuestion.create({
      data: {
        text: q.text,
        options: JSON.stringify(q.options),
        correctIdx: q.correctIdx,
        position: i + 1,
        active: true,
      },
    });
    inserted++;
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/admin/wissenstest?ok=${encodeURIComponent(`${inserted} Beispielfragen importiert (${SEED.length - inserted} bereits vorhanden).`)}` },
  });
}
