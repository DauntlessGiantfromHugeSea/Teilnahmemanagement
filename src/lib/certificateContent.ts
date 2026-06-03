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

// Bearbeitbare Standardtexte fuer Zertifikate (ueber /admin/zertifikat-texte).
export interface CertTexts {
  title: string;                  // "Zertifikat"
  subtitle: string;               // "RSS Flüssigboden®"
  normLine: string;               // 2-zeilige Norm-Linie (vor Eigenüberwachung)
  bewertungLine: string;          // Bewertung-Footer
  validityLine: string;           // "Dieses Zertifikat ist gültig bis zum {validUntil}"
  validityMonths: number;         // Gueltigkeitsdauer in Monaten (default 24)
  herrnFrauLabel: string;         // "Herrn/Frau"
  leipzigDateLabel: string;       // "Leipzig, den {issuedAt}"
  geschaeftsfuehrer: string;      // "Wolf-Hagen Stolzenburg"
  geschaeftsfuehrerRole: string;  // "Geschäftsführer"
  // Welche Kompetenzfelder bekommen die Norm-Linie (IDs)
  normLineForIds: string[];
  // TN-Bescheinigung
  tnTitle: string;                // "Teilnahmebescheinigung"
}

export const DEFAULT_CERT_TEXTS: CertTexts = {
  title: "Zertifikat",
  subtitle: "RSS Flüssigboden®",
  normLine:
    "Nach den Anforderungen der Technischen Richtlinie Flüssigboden 25.0.2 und der RegNorm – Guide für Verfüllbaustoffe – nationales Register zur Veröffentlichung von Normen VSS 2023-08",
  bewertungLine:
    "Die Bewertung erfolgte durch die Flüssigboden Akademie UG in Zusammenarbeit mit der Forschungsinstitut für Flüssigboden GmbH in ihrer Eigenschaft als Verfahrensentwicklerin, Rezepturentwicklerin und Fachplanerin.",
  validityLine: "Dieses Zertifikat ist gültig bis zum {validUntil}",
  validityMonths: 24,
  herrnFrauLabel: "Herrn/Frau",
  leipzigDateLabel: "Leipzig, den {issuedAt}",
  geschaeftsfuehrer: "Wolf-Hagen Stolzenburg",
  geschaeftsfuehrerRole: "Geschäftsführer",
  normLineForIds: ["VIII"],
  tnTitle: "Teilnahmebescheinigung",
};

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
  eventTitle: string;
  trainingTitle: string;
  eventDateLine: string;       // z.B. "18. März 2026, von 08:00 – 17:00 Uhr"
  eventDateShort: string;      // z.B. "18.03.2026"
  location: string;
  // Texte zum Zeitpunkt der Erstellung (eingefroren)
  texts: CertTexts;
  // Ausstellung / Gueltigkeit
  issuedDateShort: string;     // "07.11.2024"
  validUntilShort: string;     // "07.11.2026"
  // Zertifikat: EIN Kompetenzfeld pro PDF
  kompetenzfeld?: { id: string; label: string; text: string };
  // Teilnahmebescheinigung:
  bodyText?: string;
}

// Erzeugt eine Zertifikatsnummer.
//
// Format pro Typ:
//   ZERTIFIKAT:             JJ-{INI}-FBA/NNN          z.B. 24-SC-FBA/991
//   TEILNAHMEBESCHEINIGUNG: JJ-TN-{INI}-JJ/NNN        z.B. 24-TN-SA-24/0
//
//   - JJ:  zweistelliges Jahr (beim TN doppelt: ausgestellt + intern)
//   - INI: Initialen Nachname+Vorname (z.B. "SC" fuer Schicke Corinna)
//   - NNN: fortlaufender Zaehler pro Typ
export function buildCertificateNumber(args: {
  year: number;
  type: CertificateType;
  firstName: string;
  lastName: string;
  sequence: number;
}): string {
  const yy = String(args.year % 100).padStart(2, "0");
  const stripDiacritics = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  const ln = stripDiacritics(args.lastName).charAt(0).toUpperCase() || "X";
  const fn = stripDiacritics(args.firstName).charAt(0).toUpperCase() || "X";
  const ini = `${ln}${fn}`;
  const seq = String(args.sequence);
  if (args.type === "TEILNAHMEBESCHEINIGUNG") {
    return `${yy}-TN-${ini}-${yy}/${seq}`;
  }
  return `${yy}-${ini}-FBA/${seq}`;
}

export function numberToSlug(num: string): string {
  return num.replace(/\//g, "-");
}
