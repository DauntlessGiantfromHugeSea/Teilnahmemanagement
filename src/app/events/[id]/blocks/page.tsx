import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { parseBlocks, BLOCK_LABELS, type Block, type BlockType } from "@/lib/pageBlocks";

export const dynamic = "force-dynamic";

export default async function BlocksEditor({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canManageEvent(s, params.id))) redirect(`/events/${params.id}`);
  const ev = await prisma.event.findUnique({ where: { id: params.id } });
  if (!ev) notFound();

  const blocks = parseBlocks(ev.pageBlocks);

  return (
    <Shell session={s} active="events">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Anmeldeseite gestalten</h1>
          <p className="text-sm text-slate-500 mt-1">
            {ev.title} · {blocks.length} Bl{blocks.length === 1 ? "ock" : "öcke"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href={`/anmeldung/${ev.id}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-sm"
          >
            Vorschau ↗
          </a>
          <a href={`/events/${ev.id}`} className="btn-secondary text-sm">
            Zur Veranstaltung
          </a>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Bausteine werden auf der öffentlichen Anmeldeseite oberhalb des Anmeldeformulars
        in dieser Reihenfolge gerendert. Reihenfolge mit ↑/↓ ändern.
      </p>

      <div className="space-y-3 mb-6">
        {blocks.length === 0 && (
          <div className="card p-6 text-sm text-slate-500 text-center">
            Noch keine Bausteine. Unten einen Typ wählen und hinzufügen.
          </div>
        )}
        {blocks.map((b, i) => (
          <BlockCard key={b.id} block={b} index={i} total={blocks.length} eventId={ev.id} />
        ))}
      </div>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Neuer Baustein</h2>
        <form
          method="post"
          action={`/api/events/${ev.id}/blocks?action=add`}
          className="flex flex-col sm:flex-row gap-2"
        >
          <select name="type" defaultValue="text" className="input flex-1">
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
              <option key={t} value={t}>
                {BLOCK_LABELS[t]}
              </option>
            ))}
          </select>
          <button className="btn-primary">Hinzufügen</button>
        </form>
      </section>
    </Shell>
  );
}

function BlockCard({
  block,
  index,
  total,
  eventId,
}: {
  block: Block;
  index: number;
  total: number;
  eventId: string;
}) {
  const apiUpdate = `/api/events/${eventId}/blocks?action=update&id=${block.id}`;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="badge bg-brand-100 text-brand-700">{index + 1}</span>
          <span className="font-semibold text-slate-700">{BLOCK_LABELS[block.type]}</span>
        </div>
        <div className="flex gap-1">
          <ActionButton eventId={eventId} id={block.id} action="up" disabled={index === 0}>
            ↑
          </ActionButton>
          <ActionButton
            eventId={eventId}
            id={block.id}
            action="down"
            disabled={index === total - 1}
          >
            ↓
          </ActionButton>
          <ActionButton eventId={eventId} id={block.id} action="delete" danger>
            ✕
          </ActionButton>
        </div>
      </div>

      <form method="post" action={apiUpdate} className="space-y-2">
        {block.type === "hero" && (
          <>
            <Input name="title" label="Titel" defaultValue={block.title} />
            <Input name="text" label="Untertitel" defaultValue={block.text} />
          </>
        )}
        {block.type === "text" && (
          <Textarea name="text" label="Text" rows={4} defaultValue={block.text} />
        )}
        {block.type === "image" && (
          <>
            <Input name="url" label="Bild-URL (oder Pfad aus Media-Library)" defaultValue={block.url} />
            <Input name="text" label="Bildunterschrift (optional)" defaultValue={block.text} />
          </>
        )}
        {block.type === "button" && (
          <>
            <Input name="title" label="Beschriftung" defaultValue={block.title} />
            <Input name="href" label="Link-Ziel" defaultValue={block.href} />
            <Select
              name="variant"
              label="Stil"
              defaultValue={block.variant ?? "primary"}
              options={[
                ["primary", "Primär (Brand)"],
                ["secondary", "Sekundär"],
              ]}
            />
          </>
        )}
        {block.type === "list" && (
          <Textarea
            name="items"
            label="Punkte (ein Eintrag pro Zeile)"
            rows={5}
            defaultValue={(block.items ?? []).join("\n")}
          />
        )}
        {block.type === "divider" && (
          <p className="text-xs text-slate-500">Trennlinie – keine Konfiguration nötig.</p>
        )}
        {block.type !== "divider" && (
          <button className="btn-secondary text-xs mt-2">Speichern</button>
        )}
      </form>
    </div>
  );
}

function ActionButton({
  eventId,
  id,
  action,
  children,
  disabled,
  danger,
}: {
  eventId: string;
  id: string;
  action: "up" | "down" | "delete";
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <form method="post" action={`/api/events/${eventId}/blocks?action=${action}&id=${id}`}>
      <button
        disabled={disabled}
        className={
          "h-8 w-8 rounded-md text-sm border " +
          (danger
            ? "border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600"
            : "border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-30")
        }
      >
        {children}
      </button>
    </form>
  );
}

function Input({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input name={name} defaultValue={defaultValue ?? ""} className="input" />
    </div>
  );
}

function Textarea({
  name,
  label,
  defaultValue,
  rows,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        name={name}
        rows={rows ?? 3}
        defaultValue={defaultValue ?? ""}
        className="input"
      />
    </div>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select name={name} defaultValue={defaultValue} className="input">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
