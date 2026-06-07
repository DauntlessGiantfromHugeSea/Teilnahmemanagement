import { promises as fs } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { HelpDoc } from "./HelpDoc";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const s = await getSession();
  if (!s) redirect("/login");

  const filePath = path.join(process.cwd(), "docs", "ADMIN.md");
  const md = await fs.readFile(filePath, "utf8").catch(() => "# Dokumentation\n\nKonnte docs/ADMIN.md nicht laden.");

  // Headings fuer die Sidebar extrahieren (## und ###)
  const headings: { level: number; text: string; slug: string }[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].replace(/[`*_]/g, "").trim();
    const slug = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    headings.push({ level, text, slug });
  }

  return (
    <Shell session={s} active="help">
      <div className="flex gap-8">
        <aside className="hidden lg:block w-64 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto pr-2">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">Inhalt</div>
          <nav className="space-y-1 text-sm">
            {headings.map((h) => (
              <a
                key={h.slug}
                href={`#${h.slug}`}
                className={
                  "block py-1 hover:text-brand-700 transition " +
                  (h.level === 2 ? "font-medium text-slate-800" : "pl-4 text-slate-600 text-[13px]")
                }
              >
                {h.text}
              </a>
            ))}
          </nav>
        </aside>
        <article className="flex-1 min-w-0">
          <HelpDoc md={md} />
        </article>
      </div>
    </Shell>
  );
}
