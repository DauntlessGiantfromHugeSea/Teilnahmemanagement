// Zertifikats- und Bescheinigungs-Daten + Defaults pro Schulung.
//
// Texte basieren auf der bisherigen Word/Excel-Vorlage der FBA. Die Defaults
// koennen pro Training via Training.certDefaults (JSON) ueberschrieben werden.

export type CertificateType = "ZERTIFIKAT" | "TEILNAHMEBESCHEINIGUNG";

// Standard-Kompetenzfelder mit Bestaetigungs-Textbloecken (Zertifikat).
export const KOMPETENZFELDER: { id: string; label: string; text: string }[] = [
  {
    id: "I",
    label: "I. Rezepturumsetzung",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Verständnis, zur Nutzung und zur Umsetzung von Flüssigbodenrezepturen im Sinne des RSS® Flüssigbodenverfahrens zu besitzen.",
  },
  {
    id: "II",
    label: "II. Bodenaufbereitung und Bodenlagerung",
    text: "wird bestätigt, die theoretischen Kenntnisse zur Bodenaufbereitung und Bodenlagerung zwecks Herstellung von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen.",
  },
  {
    id: "III",
    label: "III. Personal Herstellung",
    text: "wird bestätigt, die theoretischen Kenntnisse zur Herstellung von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen.",
  },
  {
    id: "IV",
    label: "IV. Personal Transport",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Transport von Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen.",
  },
  {
    id: "V.I",
    label: "V. I. Personal Anwendung (Kanalbau)",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Einbau von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse beschränken sich auf die Anwendung Kanalbau nach geotechnischer Kategorie GK2.",
  },
  {
    id: "V.II",
    label: "V. II. Personal Anwendung (Versorgungsleitungsbau)",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Einbau von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse beschränken sich auf die Anwendung Versorgungsleitungsbau.",
  },
  {
    id: "V.III",
    label: "V. III. Personal Anwendung (Versorgungsleitungsbau Fernwärme)",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Einbau von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse beschränken sich auf die Anwendung Versorgungsleitungsbau Fernwärme nach geotechnischer Kategorie GK3.",
  },
  {
    id: "V.IV",
    label: "V. IV. Personal Anwendung (RSS Geoponton®)",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Einbau von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse beschränken sich auf die Anwendung RSS Geoponton® nach geotechnischer Kategorie GK3.",
  },
  {
    id: "V.V",
    label: "V. V. Personal Anwendung (RSS Wand / Baugruben)",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Einbau von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse beschränken sich auf die Anwendung RSS Wand / Baugruben nach geotechnischer Kategorie GK3.",
  },
  {
    id: "V.VI",
    label: "V. VI. Personal Anwendung (Rohrverlegehilfe mit hängender Verlegung)",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Einbau von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse beschränken sich auf die Anwendung Rohrverlegehilfe mit hängender Verlegung.",
  },
  {
    id: "V.VII",
    label: "V. VII. Personal Anwendung (Thermische Stabilisierung)",
    text: "wird bestätigt, die theoretischen Kenntnisse zum Einbau von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse beschränken sich auf die Anwendung Thermische Stabilisierung.",
  },
  {
    id: "VIII",
    label: "VIII. Eigenüberwachung",
    text: "wird bestätigt, die theoretischen Kenntnisse zur Eigenüberwachung von RSS® Flüssigboden im Sinne des Flüssigbodenverfahrens zu besitzen. Diese Kenntnisse sind unbeschränkt.",
  },
];

export const NORM_LINE =
  "Nach den Anforderungen der Werksnorm WN 23.0.2 und der RegNorm – Guide für Verfüllbaustoffe – nationales Register zur Veröffentlichung von Normen VSS 2023-08";

export const BEWERTUNG_LINE =
  "Die Bewertung erfolgte durch die Flüssigboden Akademie UG in Zusammenarbeit mit der Forschungsinstitut für Flüssigboden GmbH in ihrer Eigenschaft als Verfahrensentwicklerin, Rezepturentwicklerin und Fachplanerin.";

// Default-Inhalt fuer Teilnahmebescheinigungen. Pro Training via certDefaults
// ueberschreibbar.
export const TN_DEFAULT_BODY =
  "Die Fortbildung umfasste die technologischen, materialwissenschaftlichen und geotechnischen Grundlagen des RSS® Flüssigbodenverfahrens.";

export interface TrainingCertDefaults {
  // Anrechnung / Unterrichtseinheiten (z.B. "10,0 Unterrichtseinheiten (UE)")
  ueLine?: string;
  // Frei einsetzbarer Beschreibungs-Body fuer Teilnahmebescheinigung
  tnBody?: string;
  // Welche Kompetenzfelder fuer Zertifikat (Standard) vorausgewaehlt sind
  defaultKompetenzfelder?: string[]; // IDs aus KOMPETENZFELDER
  // Standard-Aussteller (Default "Flüssigboden Akademie, Leipzig")
  aussteller?: string;
  // Standard-Schulungsleiter (z.B. "Wolf-Hagen Stolzenburg")
  schulungsleiter?: string;
  // Geschaeftsfuehrer-Name (Default "Wolf-Hagen Stolzenburg")
  geschaeftsfuehrer?: string;
}

export function parseDefaults(raw: string | null | undefined): TrainingCertDefaults {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TrainingCertDefaults;
  } catch {
    return {};
  }
}

// Snapshot, der im Zertifikat-Datensatz gespeichert wird.
export interface CertificateData {
  firstName: string;
  lastName: string;
  company?: string;
  eventTitle: string;
  trainingTitle: string;
  eventDateLine: string;       // z.B. "18. März 2026, von 08:00 – 17:00 Uhr"
  eventDateShort: string;      // z.B. "18. März 2026"
  location: string;            // z.B. "Leipzig" oder "Online-Webinar"
  schulungsleiter: string;
  geschaeftsfuehrer: string;
  aussteller: string;
  ueLine?: string;
  // Zertifikat:
  kompetenzfelder?: { id: string; label: string; text: string }[];
  // Teilnahmebescheinigung:
  bodyText?: string;
  // Datum der Ausstellung
  issuedDateLine: string;      // z.B. "Leipzig, am 18. März 2026"
}

// Erzeugt die naechste Zertifikatsnummer im Format TYPJJ-INI-FBA-JJ/NNN.
// Beispiel: T24-LM-FBA-24/991
//   - TYP: "Z" (Zertifikat) oder "T" (Teilnahmebescheinigung)
//   - JJ:  zweistelliges Jahr (an TYP gehängt und nochmal vor NNN)
//   - INI: Initialen Nachname+Vorname (z.B. "LM")
//   - FBA: festes Aussteller-Kürzel
//   - NNN: fortlaufend pro Jahr+Typ (min. 3-stellig)
export function buildCertificateNumber(args: {
  year: number;
  type: CertificateType;
  firstName: string;
  lastName: string;
  sequence: number;
}): string {
  const yy = String(args.year % 100).padStart(2, "0");
  const typ = args.type === "ZERTIFIKAT" ? "Z" : "T";
  const stripDiacritics = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  const ln = stripDiacritics(args.lastName).charAt(0).toUpperCase() || "X";
  const fn = stripDiacritics(args.firstName).charAt(0).toUpperCase() || "X";
  const ini = `${ln}${fn}`;
  const seq = String(args.sequence).padStart(3, "0");
  return `${typ}${yy}-${ini}-FBA-${yy}/${seq}`;
}

export function numberToSlug(num: string): string {
  return num.replace(/\//g, "-");
}
