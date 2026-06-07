// Geheimer Token fuer den Mitarbeiter-Portal-Picker. Wird beim ersten Generieren
// von Mitarbeiter-Badges automatisch erzeugt und in AppSetting persistiert.
// Der Admin kann den Token rotieren - dann werden alle gedruckten Badges
// ungueltig und muessen neu gedruckt werden.

import crypto from "node:crypto";
import { prisma } from "./db";

const KEY = "staffPortalToken";

export async function getOrCreateStaffPortalToken(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (row?.value) return row.value;
  const token = crypto.randomBytes(18).toString("base64url"); // ~24 Zeichen, URL-sicher
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: token },
    update: { value: token },
  });
  return token;
}

export async function getStaffPortalToken(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return row?.value ?? null;
}

export async function rotateStaffPortalToken(): Promise<string> {
  const token = crypto.randomBytes(18).toString("base64url");
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: token },
    update: { value: token },
  });
  return token;
}
