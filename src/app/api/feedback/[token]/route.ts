import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getQuestionsForEvent } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const invite = await prisma.feedbackInvite.findUnique({
    where: { token: params.token },
    include: { event: true, response: true },
  });
  if (!invite) return new NextResponse("Not found", { status: 404 });
  if (invite.response) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/feedback/${invite.token}?ok=1` },
    });
  }

  const f = await req.formData();
  const questions = await getQuestionsForEvent(invite.event.feedbackQuestions ?? null);
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.type === "checkboxes") {
      answers[q.id] = f.getAll(q.id).map((v) => String(v));
    } else {
      const v = f.get(q.id);
      answers[q.id] = v ? String(v) : "";
    }
  }
  await prisma.feedbackResponse.create({
    data: {
      inviteId: invite.id,
      answers: JSON.stringify(answers),
    },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/feedback/${invite.token}?ok=1` },
  });
}
