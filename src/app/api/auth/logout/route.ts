import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
}
