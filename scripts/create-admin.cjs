#!/usr/bin/env node
// Idempotent Admin-Anlage fuer Docker-Runtime (laeuft mit reinem node,
// braucht keine devDependencies).
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
  const prisma = new PrismaClient();
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@fb-akademie.de").toLowerCase();
  // Kein Standardpasswort: ein eingechecktes Passwort waere oeffentlich
  // bekannt. Ohne gesetzte Variable wird kein Konto angelegt.
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (password.length < 12) {
    console.error(
      "[create-admin] SEED_ADMIN_PASSWORD fehlt oder ist kuerzer als 12 Zeichen - kein Admin angelegt."
    );
    process.exitCode = 1;
    return;
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`[create-admin] User ${email} existiert bereits, ueberspringe.`);
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: { email, name: "Administrator", passwordHash: hash, role: "ADMIN" },
    });
    console.log(`[create-admin] Admin angelegt: ${email}`);
    console.log("[create-admin] Beim ersten Login wird 2FA-Setup erzwungen.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
