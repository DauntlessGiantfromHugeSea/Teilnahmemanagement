import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canWriteGlobal } from "@/lib/rbac";
import { TrainingForm } from "@/components/TrainingForm";
import { prisma } from "@/lib/db";

export default async function EditTraining({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canWriteGlobal(s)) redirect("/dashboard");
  const t = await prisma.training.findUnique({ where: { id: params.id } });
  if (!t) notFound();
  return (
    <Shell session={s} active="trainings">
      <h1 className="text-2xl font-semibold mb-6">Schulung bearbeiten</h1>
      <div className="card p-6 max-w-2xl">
        <TrainingForm training={t} action={`/api/trainings/${t.id}`} />
      </div>
    </Shell>
  );
}
