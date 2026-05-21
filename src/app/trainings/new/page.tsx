import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canWriteGlobal } from "@/lib/rbac";
import { TrainingForm } from "@/components/TrainingForm";

export default async function NewTraining() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canWriteGlobal(s)) redirect("/dashboard");
  return (
    <Shell session={s} active="trainings">
      <h1 className="text-2xl font-semibold mb-6">Neue Schulung</h1>
      <div className="card p-6 max-w-2xl">
        <TrainingForm action="/api/trainings" />
      </div>
    </Shell>
  );
}
