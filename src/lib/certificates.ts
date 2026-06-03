// Service-Schicht fuer Zertifikate / Teilnahmebescheinigungen.

import { prisma } from "./db";
import { decryptParticipant } from "./participants";
import {
  buildCertificateNumber,
  numberToSlug,
  parseDefaults,
  KOMPETENZFELDER,
  type CertificateType,
  type CertificateData,
} from "./certificateContent";
import type { Participant, Event, Training } from "@prisma/client";

function fmtDateLong(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function fmtEventDateLine(ev: { day1Date: Date | null; day2Date: Date | null; startTime: string | null; endTime: string | null }): string {
  const d1 = fmtDateLong(ev.day1Date);
  const d2 = fmtDateLong(ev.day2Date);
  const datePart = d2 ? `${d1} bis ${d2}` : d1;
  const timePart = ev.startTime && ev.endTime ? `, von ${ev.startTime} – ${ev.endTime} Uhr` : "";
  return `${datePart}${timePart}`;
}

function fmtEventDateShort(ev: { day1Date: Date | null; day2Date: Date | null }): string {
  return fmtDateLong(ev.day1Date);
}

export interface BuildCertificateDataArgs {
  participant: Participant;
  event: Event & { training: Training };
  type: CertificateType;
  kompetenzfeldIds?: string[]; // nur fuer ZERTIFIKAT
  issuedAt?: Date;
}

export function buildCertificateData(args: BuildCertificateDataArgs): CertificateData {
  const dec = decryptParticipant(args.participant);
  const defaults = parseDefaults(args.event.training.certDefaults);
  const issued = args.issuedAt ?? new Date();
  const eventDateLine = fmtEventDateLine(args.event);
  const eventDateShort = fmtEventDateShort(args.event);
  const location = args.event.format === "WEBINAR"
    ? "Online-Webinar"
    : (args.event.location ?? "Leipzig");

  const kompetenzfelder =
    args.type === "ZERTIFIKAT" && args.kompetenzfeldIds && args.kompetenzfeldIds.length > 0
      ? KOMPETENZFELDER.filter((k) => args.kompetenzfeldIds!.includes(k.id))
      : undefined;

  return {
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
    company: dec.company ?? undefined,
    eventTitle: args.event.title,
    trainingTitle: args.event.training.title,
    eventDateLine,
    eventDateShort,
    location,
    schulungsleiter: defaults.schulungsleiter ?? "Wolf-Hagen Stolzenburg",
    geschaeftsfuehrer: defaults.geschaeftsfuehrer ?? "Wolf-Hagen Stolzenburg",
    aussteller: defaults.aussteller ?? "Flüssigboden Akademie, Leipzig",
    ueLine: defaults.ueLine,
    kompetenzfelder,
    bodyText: args.type === "TEILNAHMEBESCHEINIGUNG" ? defaults.tnBody : undefined,
    issuedDateLine: `Leipzig, am ${fmtDateLong(issued)}`,
  };
}

// Naechste fortlaufende Nummer pro Jahr+Typ
export async function nextCertificateNumber(args: {
  year: number;
  type: CertificateType;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const yy = String(args.year % 100).padStart(2, "0");
  const typ = args.type === "ZERTIFIKAT" ? "Z" : "T";
  // Prefix bis vor /NNN: "TC24-" oder "Z24-"  -- damit zaehlen wir pro Jahr+Typ
  const prefix = `${typ}${yy}-`;
  const last = await prisma.certificate.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
  });
  let nextSeq = 1;
  if (last) {
    const m = last.number.match(/\/(\d+)$/);
    if (m) nextSeq = parseInt(m[1], 10) + 1;
  }
  return buildCertificateNumber({
    year: args.year,
    type: args.type,
    firstName: args.firstName,
    lastName: args.lastName,
    sequence: nextSeq,
  });
}

// Legt einen DRAFT-Datensatz fuer einen Teilnehmer an. Idempotent pro (participant,type)?
// Nein - wir erlauben mehrere Zertifikate pro Teilnehmer (z.B. ein TN + ein Z).
export async function createCertificateDraft(args: {
  participantId: string;
  type: CertificateType;
  createdById: string;
  kompetenzfeldIds?: string[];
}): Promise<{ id: string; number: string; slug: string }> {
  const participant = await prisma.participant.findUnique({
    where: { id: args.participantId },
    include: { event: { include: { training: true } } },
  });
  if (!participant) throw new Error("Teilnehmer nicht gefunden.");

  const year = (participant.event.day1Date ?? new Date()).getFullYear();
  const dec = decryptParticipant(participant);
  const number = await nextCertificateNumber({
    year,
    type: args.type,
    firstName: dec.firstName ?? "",
    lastName: dec.lastName ?? "",
  });
  const slug = numberToSlug(number);

  const data = buildCertificateData({
    participant,
    event: participant.event,
    type: args.type,
    kompetenzfeldIds: args.kompetenzfeldIds,
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

export function parseCertificateData(raw: string): CertificateData {
  return JSON.parse(raw) as CertificateData;
}
