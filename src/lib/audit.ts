import { prisma } from "./db";
import { encryptField } from "./crypto";

interface AuditInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  participantId?: string | null;
  diff?: unknown;
  encryptDiff?: boolean;
}

export async function audit(input: AuditInput) {
  let diff: string | null = null;
  if (input.diff !== undefined) {
    const s = JSON.stringify(input.diff);
    diff = input.encryptDiff ? encryptField(s) : s;
  }
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      participantId: input.participantId ?? null,
      diff,
    },
  });
}
