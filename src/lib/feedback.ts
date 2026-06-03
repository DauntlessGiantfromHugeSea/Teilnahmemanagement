// Feedback-Fragebogen: globale Vorlage + pro-Event-Override.
//
// Fragen werden als JSON gespeichert (AppSetting key 'feedbackQuestions' bzw.
// Event.feedbackQuestions). Beim Rendern und Speichern verwenden wir das
// gleiche Schema.

import { prisma } from "./db";

export type QuestionType = "select" | "text" | "textarea" | "checkboxes" | "radio";

export interface FeedbackQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];        // fuer select / checkboxes / radio
  description?: string;      // optionaler Hinweistext unter der Frage
  required?: boolean;
}

const RATING_OPTIONS = [
  "Trifft voll zu",
  "Trifft eher zu",
  "Teils/teils",
  "Trifft eher nicht zu",
  "Trifft nicht zu",
];

export const DEFAULT_FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  { id: "q1", text: "Empfanden Sie den Seminarraum als angenehm?", type: "select", options: RATING_OPTIONS },
  { id: "q2", text: "War der Seminarablauf abwechslungsreich?", type: "select", options: RATING_OPTIONS },
  { id: "q3", text: "Konnten Sie dem Vortragenden gut folgen? Wurden die Inhalte verständlich vermittelt?", type: "select", options: RATING_OPTIONS },
  { id: "q4", text: "Konnte die Schulung Ihre inhaltlichen Erwartungen erfüllen?", type: "select", options: RATING_OPTIONS },
  { id: "q5", text: "War die Anzahl der Themen übersichtlich und ausreichend?", type: "select", options: RATING_OPTIONS },
  { id: "q6", text: "Was hat Ihnen besonders gefallen?", type: "textarea" },
  {
    id: "q7",
    text: "Gibt es Dinge, die Sie verbessern würden?",
    type: "checkboxes",
    options: [
      "Gezieltere Themenauswahl",
      "Zeitliche Struktur",
      "Abwechslungsreicherer Ablauf",
      "Seminarraum",
      "Verständliche Vermittlung der Inhalte",
      "Veranschaulichung an Praxisbeispielen mit Bildern und Videomaterial",
      "Interaktivere Aufgaben",
      "Sonstiges (Bemerkungen in Frage 12)",
    ],
  },
  { id: "q8", text: "Haben Sie Anmerkungen oder Verbesserungsvorschläge zu unserer Schulungsplattform?", type: "textarea" },
  {
    id: "q9",
    text: "Haben Sie Anmerkungen/Verbesserungsvorschläge?",
    description: "Hier können Sie Anmerkungen und nähere Erläuterungen zu Ihren bisherigen Antworten und sonstige Kritik-/Verbesserungspunkte erläutern. Wir sind Ihnen dankbar für jedes konstruktive und ehrliche Feedback!",
    type: "textarea",
  },
  { id: "q10", text: "Ihre Meinung zur Abendveranstaltung:", type: "text" },
  { id: "q11", text: "Wie hat Ihnen die Veranstaltung insgesamt gefallen? (Schulnoten 1 bis 6)", type: "select", options: ["1 – Sehr gut", "2 – Gut", "3 – Befriedigend", "4 – Ausreichend", "5 – Mangelhaft", "6 – Ungenügend"] },
  {
    id: "q12",
    text: "Würden Sie uns Ihren Kollegen und Bekannten weiterempfehlen?",
    type: "radio",
    options: ["Ja, sehr", "Ja, wahrscheinlich", "Eher unwahrscheinlich", "Nein"],
  },
  { id: "q13", text: "Anmerkungen", type: "textarea" },
];

const KEY = "feedbackQuestions";

let cache: { ts: number; data: FeedbackQuestion[] } | null = null;
const TTL = 60_000;

export async function getDefaultQuestions(): Promise<FeedbackQuestion[]> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data;
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  let data = DEFAULT_FEEDBACK_QUESTIONS;
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) data = parsed;
    } catch { /* defaults */ }
  }
  cache = { ts: Date.now(), data };
  return data;
}

export async function saveDefaultQuestions(qs: FeedbackQuestion[]): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(qs) },
    update: { value: JSON.stringify(qs) },
  });
  cache = null;
}

export async function getQuestionsForEvent(eventOverrideJson: string | null): Promise<FeedbackQuestion[]> {
  if (eventOverrideJson) {
    try {
      const parsed = JSON.parse(eventOverrideJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fallback */ }
  }
  return getDefaultQuestions();
}

// Kurze, sprechende Schulungs-ID fuers Frontend (damit der Teilnehmer am Token-
// Link sofort sieht, dass das Feedback fuer die richtige Schulung ist).
export function shortEventId(eventId: string, externalId: string | null): string {
  if (externalId) return externalId;
  return eventId.slice(-6).toUpperCase();
}
