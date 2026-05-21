import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import {
  parseBlocks,
  serializeBlocks,
  newBlock,
  moveBlock,
  type BlockType,
  type Block,
} from "@/lib/pageBlocks";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await canWriteEvent(s, params.id))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ev = await prisma.event.findUnique({ where: { id: params.id } });
  if (!ev) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  const blockId = url.searchParams.get("id") ?? "";

  const f = await req.formData().catch(() => new FormData());
  const current = parseBlocks(ev.pageBlocks);
  let next = current;

  if (action === "add") {
    const type = String(f.get("type") ?? "text") as BlockType;
    next = [...current, newBlock(type)];
  } else if (action === "delete") {
    next = current.filter((b) => b.id !== blockId);
  } else if (action === "up") {
    next = moveBlock(current, blockId, -1);
  } else if (action === "down") {
    next = moveBlock(current, blockId, 1);
  } else if (action === "update") {
    next = current.map<Block>((b) => {
      if (b.id !== blockId) return b;
      const upd: Block = { ...b };
      if (b.type === "hero") {
        upd.title = String(f.get("title") ?? "").trim();
        upd.text = String(f.get("text") ?? "").trim();
      } else if (b.type === "text") {
        upd.text = String(f.get("text") ?? "");
      } else if (b.type === "image") {
        upd.url = String(f.get("url") ?? "").trim();
        upd.text = String(f.get("text") ?? "").trim();
      } else if (b.type === "button") {
        upd.title = String(f.get("title") ?? "").trim() || "Klick";
        upd.href = String(f.get("href") ?? "").trim() || "#";
        upd.variant = (String(f.get("variant") ?? "primary") === "secondary"
          ? "secondary"
          : "primary") as "primary" | "secondary";
      } else if (b.type === "list") {
        upd.items = String(f.get("items") ?? "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return upd;
    });
  }

  await prisma.event.update({
    where: { id: ev.id },
    data: { pageBlocks: serializeBlocks(next) },
  });
  await audit({
    actorId: s.uid,
    action: "BLOCKS_UPDATE",
    entityType: "Event",
    entityId: ev.id,
    diff: { action, blockId, count: next.length },
  });

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${ev.id}/blocks` },
  });
}
