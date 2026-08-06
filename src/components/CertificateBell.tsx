import Link from "next/link";
import type { SessionPayload } from "@/lib/session";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

// Header-Glocke: zeigt Admins die Anzahl der ungesehenen Zertifikat-Prueflink-
// Aufrufe an und verlinkt auf die Uebersicht /admin/zertifikat-pruefungen.
export async function CertificateBell({ session }: { session: SessionPayload }) {
  if (session.role !== Role.ADMIN) return null;

  let unseen = 0;
  try {
    unseen = await prisma.certificateView.count({ where: { seenAt: null } });
  } catch {
    return null;
  }

  const has = unseen > 0;
  const label =
    unseen === 0
      ? "Zertifikat-Prüfungen"
      : `${unseen} neue Zertifikat-Prüfung${unseen === 1 ? "" : "en"}`;

  return (
    <Link
      href="/admin/zertifikat-pruefungen"
      aria-label={label}
      title={label}
      className="relative shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {has && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-ink text-[10px] font-bold flex items-center justify-center shadow"
          aria-hidden
        >
          {unseen > 99 ? "99+" : unseen}
        </span>
      )}
    </Link>
  );
}
