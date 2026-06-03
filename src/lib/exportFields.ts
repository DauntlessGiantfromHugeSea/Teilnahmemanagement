import type { DayOption, ParticipantStatus, InvoiceStatus } from "@prisma/client";

export type ExportFieldKey =
  | "eventTitle"
  | "eventDay1"
  | "eventDay2"
  | "eventLocation"
  | "eventFormat"
  | "dayOption"
  | "status"
  | "lastName"
  | "firstName"
  | "email"
  | "phone"
  | "company"
  | "street"
  | "zip"
  | "city"
  | "country"
  | "notes"
  | "costCenter"
  | "billingCompany"
  | "billingName"
  | "billingStreet"
  | "billingZipCity"
  | "billingEmail"
  | "basePrice"
  | "discount"
  | "finalPrice"
  | "invoiceStatus"
  | "invoiceNumber"
  | "invoiceIssuedAt"
  | "invoicePaidAt"
  | "createdAt"
  | "updatedAt";

export interface ExportFieldDef {
  key: ExportFieldKey;
  label: string;
  width: number;
  group: "Veranstaltung" | "Person" | "Anschrift" | "Rechnung" | "Buchhaltung" | "Meta";
}

export const EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "eventTitle",    label: "Veranstaltung",     width: 36, group: "Veranstaltung" },
  { key: "eventDay1",     label: "1. Tag",            width: 12, group: "Veranstaltung" },
  { key: "eventDay2",     label: "2. Tag",            width: 12, group: "Veranstaltung" },
  { key: "eventLocation", label: "Ort/Webinar",       width: 28, group: "Veranstaltung" },
  { key: "eventFormat",   label: "Format",            width: 12, group: "Veranstaltung" },
  { key: "dayOption",     label: "Tagewahl",          width: 12, group: "Veranstaltung" },
  { key: "status",        label: "Status",            width: 14, group: "Veranstaltung" },

  { key: "lastName",      label: "Nachname",          width: 18, group: "Person" },
  { key: "firstName",     label: "Vorname",           width: 16, group: "Person" },
  { key: "email",         label: "E-Mail",            width: 28, group: "Person" },
  { key: "phone",         label: "Telefon",           width: 16, group: "Person" },
  { key: "company",       label: "Firma",             width: 24, group: "Person" },

  { key: "street",        label: "Straße",            width: 24, group: "Anschrift" },
  { key: "zip",           label: "PLZ",               width: 8,  group: "Anschrift" },
  { key: "city",          label: "Ort",               width: 18, group: "Anschrift" },
  { key: "country",       label: "Land",              width: 10, group: "Anschrift" },

  { key: "costCenter",    label: "Kostenstelle",      width: 14, group: "Rechnung" },
  { key: "billingCompany",label: "RE-Firma",          width: 24, group: "Rechnung" },
  { key: "billingName",   label: "RE-Name",           width: 20, group: "Rechnung" },
  { key: "billingStreet", label: "RE-Straße",         width: 24, group: "Rechnung" },
  { key: "billingZipCity",label: "RE-PLZ/Ort",        width: 20, group: "Rechnung" },
  { key: "billingEmail",  label: "RE-E-Mail",         width: 28, group: "Rechnung" },

  { key: "basePrice",     label: "Grundpreis (EUR)",  width: 14, group: "Buchhaltung" },
  { key: "discount",      label: "Rabatt %",          width: 10, group: "Buchhaltung" },
  { key: "finalPrice",    label: "Endpreis (EUR)",    width: 14, group: "Buchhaltung" },
  { key: "invoiceStatus", label: "RE-Status",         width: 14, group: "Buchhaltung" },
  { key: "invoiceNumber", label: "RE-Nummer",         width: 16, group: "Buchhaltung" },
  { key: "invoiceIssuedAt",label: "RE-Datum",         width: 14, group: "Buchhaltung" },
  { key: "invoicePaidAt", label: "RE-bezahlt am",     width: 14, group: "Buchhaltung" },

  { key: "notes",         label: "Notizen",           width: 40, group: "Meta" },
  { key: "createdAt",     label: "Anmeldung",         width: 16, group: "Meta" },
  { key: "updatedAt",     label: "Aktualisiert",      width: 16, group: "Meta" },
];

export const DEFAULT_FIELDS: ExportFieldKey[] = [
  "eventTitle", "eventDay1", "dayOption",
  "lastName", "firstName", "email", "phone", "company",
  "zip", "city",
];

export function dayOptionLabel(opt: DayOption | string): string {
  if (opt === "DAY_1") return "Tag 1";
  if (opt === "DAY_2") return "Tag 2";
  return "Beide Tage";
}

export function statusLabel(s: ParticipantStatus | string): string {
  if (s === "REGISTERED") return "Angemeldet";
  if (s === "CONFIRMED") return "Bestätigt";
  if (s === "ATTENDED") return "Teilgenommen";
  if (s === "NO_SHOW") return "Nicht erschienen";
  if (s === "CANCELLED") return "Storniert";
  return String(s);
}

export function invoiceStatusLabel(s: InvoiceStatus | string): string {
  if (s === "OPEN") return "offen";
  if (s === "ISSUED") return "gestellt";
  if (s === "PAID") return "bezahlt";
  if (s === "CANCELLED") return "storniert";
  return String(s);
}
