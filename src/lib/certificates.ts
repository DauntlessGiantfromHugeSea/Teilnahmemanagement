// Service-Schicht fuer Zertifikate / Teilnahmebescheinigungen.

import { prisma } from "./db";
import { decryptParticipant } from "./participants";
import {
  buildCertificateNumber,
  numberToSlug,
  parseDefaults,
  type CertificateType,
  type CertificateData,
} from "./certificateContent";
import { resolveKompetenzfelder, getCertTexts, nextSequence } from "./kompetenzfelder";
import type { Participant, Event, Training } from "@prisma/client";

function fmtDateShort(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}
function fmtDateLong(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function fmtEventDateLine(ev: { day1Date: Date | null; day2Date: Date | null; startTime: string | null; endTime: string | null }): string {
  const d1 = ev.day1Date ? new Date(ev.day1Date) : null;
  const d2 = ev.day2Date ? new Date(ev.day2Date) : null;
  let datePart = "";
  if (d1 && d2) {
    const sameMonth = d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
    if (sameMonth) {
      const day1 = d1.toLocaleDateString("de-DE", { day: "2-digit" });
      const rest = d2.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
      datePart = `${day1}.–${rest}`;
    } else {
      datePart = `${fmtDateLong(d1)} – ${fmtDateLong(d2)}`;
    }
  } else if (d1) {
    datePart = fmtDateLong(d1);
  }
  const timePart = ev.startTime && ev.endTime ? `, von ${ev.startTime} – ${ev.endTime} Uhr` : "";
  return `${datePart}${timePart}`;
}

export interface BuildCertificateDataArgs {
  participant: Participant;
  event: Event & { training: Training };
  type: CertificateType;
  kompetenzfeldId?: string; // EIN Kompetenzfeld pro Zertifikat
  issuedAt?: Date;
}

export async function buildCertificateData(args: BuildCertificateDataArgs): Promise<CertificateData> {
  const dec = decryptParticipant(args.participant);
  const defaults = parseDefaults(args.event.training.certDefaults);
  const texts = await getCertTexts();
  const issued = args.issuedAt ?? new Date();
  const validUntil = new Date(issued);
  validUntil.setMonth(validUntil.getMonth() + (texts.validityMonths ?? 24));

  const eventDateLine = fmtEventDateLine(args.event);
  const eventDateShort = fmtDateShort(args.event.day1Date);
  const location = args.event.format === "WEBINAR"
    ? "Online-Webinar"
    : (args.event.location ?? "Leipzig");

  let kompetenzfeld: CertificateData["kompetenzfeld"] = undefined;
  if (args.type === "ZERTIFIKAT" && args.kompetenzfeldId) {
    const resolved = await resolveKompetenzfelder([args.kompetenzfeldId]);
    if (resolved[0]) kompetenzfeld = resolved[0];
  }

  return {
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
    eventTitle: args.event.title,
    trainingTitle: args.event.training.title,
    eventDateLine,
    eventDateShort,
    location,
    texts,
    issuedDateShort: fmtDateShort(issued),
    validUntilShort: fmtDateShort(validUntil),
    kompetenzfeld,
    bodyText:
      args.type === "TEILNAHMEBESCHEINIGUNG"
        ? (args.event.certTnBody?.trim() || defaults.tnBody)
        : undefined,
  };
}

// Globaler fortlaufender Counter ueber AppSetting.
export async function nextCertificateNumber(args: {
  year: number;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const seq = await nextSequence();
  return buildCertificateNumber({
    year: args.year,
    firstName: args.firstName,
    lastName: args.lastName,
    sequence: seq,
  });
}

// Legt einen DRAFT-Datensatz fuer einen Teilnehmer an.
export async function createCertificateDraft(args: {
  participantId: string;
  type: CertificateType;
  createdById: string;
  kompetenzfeldId?: string;
}): Promise<{ id: string; number: string; slug: string }> {
  const participant = await prisma.participant.findUnique({
    where: { id: args.participantId },
    include: { event: { include: { training: true } } },
  });
  if (!participant) throw new Error("Teilnehmer nicht gefunden.");

  const dec = decryptParticipant(participant);
  const year = new Date().getFullYear();
  const number = await nextCertificateNumber({
    year,
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
  });
  const slug = numberToSlug(number);

  const data = await buildCertificateData({
    participant,
    event: participant.event,
    type: args.type,
    kompetenzfeldId: args.kompetenzfeldId,
  });

  const cert = await prisma.certificate.create({
    data: {
      number,
      slug,
      participantId: participant.id,
      type: args.type,
      status: "DRAFT",
      data: JSON.stringify(data),
      createdById: args.createdById,
    },
  });
  return { id: cert.id, number, slug };
}

// Normalisiert das Snapshot-JSON. Aeltere Zertifikate (vor dem Layout-Rewrite)
// hatten andere Felder (kompetenzfelder-Array statt kompetenzfeld, issuedDateLine
// statt issuedDateShort, kein texts-Objekt). Fuer den Renderer hier abfangen.
export function parseCertificateData(raw: string): CertificateData {
  const j = JSON.parse(raw) as any;

  // Plural -> Singular
  let kompetenzfeld = j.kompetenzfeld;
  if (!kompetenzfeld && Array.isArray(j.kompetenzfelder) && j.kompetenzfelder.length > 0) {
    kompetenzfeld = j.kompetenzfelder[0];
  }

  // Ausstellungs-Datum: aus issuedDateLine "Leipzig, am 18. März 2026" extrahieren,
  // wenn keine issuedDateShort vorhanden ist.
  let issuedDateShort = j.issuedDateShort;
  if (!issuedDateShort && typeof j.issuedDateLine === "string") {
    const m = j.issuedDateLine.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/);
    if (m) {
      const month = MONTHS.indexOf(m[2]);
      if (month >= 0) {
        const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10));
        issuedDateShort = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      }
    }
  }
  if (!issuedDateShort) issuedDateShort = new Date().toLocaleDateString("de-DE");

  return {
    firstName: j.firstName ?? "",
    lastName: j.lastName ?? "",
    eventTitle: j.eventTitle ?? "",
    trainingTitle: j.trainingTitle ?? j.eventTitle ?? "",
    eventDateLine: j.eventDateLine ?? "",
    eventDateShort: j.eventDateShort ?? "",
    location: j.location ?? "",
    texts: j.texts,
    issuedDateShort,
    validUntilShort: j.validUntilShort ?? "",
    kompetenzfeld,
    bodyText: j.bodyText,
  };
}

const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
