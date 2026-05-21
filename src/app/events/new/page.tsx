import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canWriteGlobal } from "@/lib/rbac";
import { EventForm } from "@/components/EventForm";

export default async function NewEvent({
  searchParams,
}: {
  searchParams: { ok?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canWriteGlobal(s)) redirect("/dashboard");
  return (
    <Shell session={s} active="events">
      <h1 className="text-2xl font-semibold mb-6">Neue Veranstaltung</h1>
      {searchParams.ok && (
        <div className="mb-4 max-w-2xl rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          Veranstaltung gespeichert. Du kannst direkt die nächste anlegen.
        </div>
      )}
      <div className="card p-6 max-w-2xl">
        <EventForm action="/api/events" allowAddAnother />
      </div>
    </Shell>
  );
}
