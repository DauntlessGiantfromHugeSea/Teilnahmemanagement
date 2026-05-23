import crypto from "node:crypto";

export type BlockType =
  | "hero"
  | "text"
  | "image"
  | "button"
  | "list"
  | "divider";

export interface Block {
  id: string;
  type: BlockType;
  // generischer Inhalt – je nach Type unterschiedlich genutzt
  title?: string;
  text?: string;
  url?: string;
  href?: string;
  items?: string[];
  align?: "left" | "center" | "right";
  variant?: "primary" | "secondary";
}

export function parseBlocks(raw: string | null | undefined): Block[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.filter(isBlock);
  } catch {
    // ignore
  }
  return [];
}

export function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks);
}

export function newId(): string {
  return crypto.randomBytes(4).toString("hex");
}

export function newBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "hero":
      return { id, type, title: "Titel", text: "Untertitel" };
    case "text":
      return { id, type, text: "Hier den Text eingeben …" };
    case "image":
      return { id, type, url: "", text: "" };
    case "button":
      return { id, type, title: "Jetzt anmelden", href: "#anmeldung", variant: "primary" };
    case "list":
      return { id, type, items: ["Punkt 1", "Punkt 2"] };
    case "divider":
      return { id, type };
  }
}

export function moveBlock(blocks: Block[], id: string, dir: -1 | 1): Block[] {
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) return blocks;
  const j = i + dir;
  if (j < 0 || j >= blocks.length) return blocks;
  const out = blocks.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function isBlock(x: any): x is Block {
  return x && typeof x === "object" && typeof x.id === "string" && typeof x.type === "string";
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero (Titel + Untertitel)",
  text: "Text-Absatz",
  image: "Bild",
  button: "Button",
  list: "Bullet-Liste",
  divider: "Trennlinie",
};
