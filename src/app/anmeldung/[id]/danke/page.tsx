import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DankeSeite({ params }: { params: { id: string } }) {
  const ev = await prisma.event.findUnique({ where: { id: params.id } });
  if (!ev) notFound();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-transparent">
      <div className="w-full max-w-xl">
        <div className="card p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">Vielen Dank für Ihre Anmeldung</h1>
          <p className="text-sm text-slate-600 mt-3">
            Ihre verbindliche Anmeldung für <strong>{ev.title}</strong> ist bei uns
            eingegangen. Wir melden uns in Kürze mit den Detailinformationen und der
            Rechnung.
          </p>
        </div>
      </div>
    </div>
  );
}
