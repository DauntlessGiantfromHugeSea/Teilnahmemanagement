// Prueft das Zusammenstellen der Empfaenger einer Rundmail gegen eine echte
// Datenbank: Entschluesselung, Dubletten ueber mehrere Veranstaltungen,
// fehlende Adressen und die Bindung an die Veranstaltungsfreigaben.
//
// NIEMALS gegen die Produktionsdatenbank laufen lassen - das Skript schreibt.
// Es weigert sich, wenn der Datenbankname nicht "test" enthaelt.
//
//   createdb tm_test
//   DATABASE_URL="postgresql://.../tm_test" npx prisma db push
//   DATABASE_URL="postgresql://.../tm_test" \
//   FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32) \
//     npx tsx scripts/test-broadcast-db.ts

import { PrismaClient } from "@prisma/client";
import { blindIndex, encryptField } from "@/lib/crypto";
import { collectEventRecipients } from "@/lib/broadcast";

const url = process.env.DATABASE_URL ?? "";
const dbName = url.split("/").pop()?.split("?")[0] ?? "";
if (!/test/i.test(dbName)) {
  console.error(
    `Abbruch: DATABASE_URL zeigt auf "${dbName}". Dieses Skript schreibt und\n` +
      'laeuft nur gegen eine Datenbank, deren Name "test" enthaelt.'
  );
  process.exit(2);
}

const prisma = new PrismaClient();
let fails = 0;
const check = (n: string, c: boolean, x?: unknown) => {
  if (!c) {
    fails++;
    console.log("FAIL", n, x ?? "");
  } else console.log("ok  ", n);
};

async function addParticipant(eventId: string, first: string, last: string, email: string) {
  await prisma.participant.create({
    data: {
      eventId,
      firstName: encryptField(first)!,
      lastName: encryptField(last)!,
      email: encryptField(email) ?? "",
      emailHash: blindIndex(email),
      company: encryptField("Bau Müller GmbH"),
    },
  });
}

async function main() {
  // --- Aufraeumen --------------------------------------------------------
  await prisma.participant.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.training.deleteMany({});

  const autor = await prisma.user.upsert({
    where: { email: "pruefung@broadcast.test" },
    update: {},
    create: {
      email: "pruefung@broadcast.test",
      name: "Prüferin",
      passwordHash: "x",
      role: "ADMIN",
    },
  });

  const training = await prisma.training.create({
    data: { title: "Flüssigboden kompakt", priceDay1: 49000, priceDay2: 0, priceBoth: 0 },
  });

  const webinarA = await prisma.event.create({
    data: {
      training: { connect: { id: training.id } },
      createdBy: { connect: { id: autor.id } },
      title: "Webinar Januar",
      format: "WEBINAR",
      day1Date: new Date("2027-01-20T00:00:00Z"),
    },
  });
  const webinarB = await prisma.event.create({
    data: {
      training: { connect: { id: training.id } },
      createdBy: { connect: { id: autor.id } },
      title: "Webinar Februar",
      format: "WEBINAR",
      day1Date: new Date("2027-02-11T00:00:00Z"),
    },
  });
  const fremd = await prisma.event.create({
    data: {
      training: { connect: { id: training.id } },
      createdBy: { connect: { id: autor.id } },
      title: "Fremde Veranstaltung",
      format: "PRESENCE",
    },
  });

  await addParticipant(webinarA.id, "Maria", "Schmidt", "maria@bau-mueller.de");
  await addParticipant(webinarA.id, "Thomas", "Klein", "thomas@bau-mueller.de");
  // Dieselbe Person ist auch im Februar-Webinar angemeldet.
  await addParticipant(webinarB.id, "Maria", "Schmidt", "maria@bau-mueller.de");
  await addParticipant(webinarB.id, "Anna", "Weber", "anna@weber-bau.de");
  // Ohne Mailadresse - darf nicht als Empfaenger zaehlen.
  await addParticipant(webinarB.id, "Ohne", "Mail", "");
  await addParticipant(fremd.id, "Geheim", "Person", "geheim@fremd.de");

  // --- Eine Veranstaltung ------------------------------------------------
  {
    const r = await collectEventRecipients([webinarA.id], "ALL");
    check("Webinar A: zwei Empfaenger", r.recipients.length === 2, r.recipients.map((x) => x.email));
    check(
      "Namen werden entschluesselt",
      r.recipients.some((x) => x.firstName === "Maria" && x.lastName === "Schmidt"),
      r.recipients
    );
    check(
      "Firma wird entschluesselt",
      r.recipients.every((x) => x.company === "Bau Müller GmbH"),
      r.recipients.map((x) => x.company)
    );
    check(
      "Veranstaltungstitel dabei",
      r.recipients.every((x) => x.eventTitle === "Webinar Januar")
    );
    check(
      "Datum lesbar formatiert",
      r.recipients[0].eventDate.includes("Januar"),
      r.recipients[0].eventDate
    );
  }

  // --- Mehrere Veranstaltungen, Dubletten --------------------------------
  {
    const r = await collectEventRecipients([webinarA.id, webinarB.id], "ALL");
    check("beide Webinare: drei verschiedene Adressen", r.recipients.length === 3, r.recipients.map((x) => x.email));
    const maria = r.recipients.filter((x) => x.email === "maria@bau-mueller.de");
    check("Maria nur einmal", maria.length === 1, maria.length);
    check("Teilnehmer ohne Mailadresse gezaehlt", r.withoutEmail === 1, r.withoutEmail);
  }

  // --- Freigaben ---------------------------------------------------------
  {
    // Nur Webinar A freigegeben: die Teilnehmer der anderen bleiben aussen vor.
    const r = await collectEventRecipients([webinarA.id, webinarB.id, fremd.id], [webinarA.id]);
    check("nur freigegebene Veranstaltung", r.recipients.length === 2, r.recipients.map((x) => x.email));
    check(
      "fremde Teilnehmer nicht enthalten",
      !r.recipients.some((x) => x.email === "geheim@fremd.de"),
      r.recipients.map((x) => x.email)
    );
  }
  {
    const r = await collectEventRecipients([fremd.id], []);
    check("ohne jede Freigabe keine Empfaenger", r.recipients.length === 0);
  }
  {
    const r = await collectEventRecipients([], "ALL");
    check("ohne Auswahl keine Empfaenger", r.recipients.length === 0);
  }

  // --- Aufraeumen --------------------------------------------------------
  await prisma.participant.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.training.deleteMany({});
}

main()
  .catch((e) => {
    console.error(e);
    fails++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(
      fails === 0 ? "\nAlle Pruefungen bestanden." : `\n${fails} Pruefung(en) fehlgeschlagen.`
    );
    process.exit(fails === 0 ? 0 : 1);
  });
