import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { getKompetenzfelder, getCertTexts } from "@/lib/kompetenzfelder";

export const dynamic = "force-dynamic";

export default async function KompetenzfelderPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const items = await getKompetenzfelder();
  const texts = await getCertTexts();

  return (
    <Shell session={s} active="kompetenzfelder">
      <h1 className="text-2xl font-semibold mb-1">Zertifikat-Texte &amp; Kompetenzfelder</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Zentrale Bearbeitung aller Standardtexte, die auf neu erstellten Zertifikaten und Teilnahmebescheinigungen
        erscheinen. Änderungen wirken nur auf neu erzeugte PDFs; bereits angelegte Zertifikate behalten ihren Text.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      {/* Globale Texte */}
      <form method="post" action="/api/admin/cert-texts" className="space-y-4 mb-10">
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">Allgemein</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input name="title" label="Titel (Zertifikat)" defaultValue={texts.title} />
            <Input name="tnTitle" label="Titel (Teilnahmebescheinigung)" defaultValue={texts.tnTitle} />
            <Input name="subtitle" label="Untertitel" defaultValue={texts.subtitle} />
            <Input name="herrnFrauLabel" label="Anrede-Label" defaultValue={texts.herrnFrauLabel} />
            <Input name="geschaeftsfuehrer" label="Geschäftsführer (Name)" defaultValue={texts.geschaeftsfuehrer} />
            <Input name="geschaeftsfuehrerRole" label="Rolle" defaultValue={texts.geschaeftsfuehrerRole} />
            <Input name="validityMonths" type="number" label="Gültigkeit (Monate)" defaultValue={String(texts.validityMonths)} />
          </div>
          <Textarea name="normLine" label="Norm-Linie (über Eigenüberwachung etc.)" defaultValue={texts.normLine} rows={3} />
          <Input
            name="normLineForIds"
            label="Norm-Linie zeigen bei Kompetenzfeldern (IDs kommagetrennt)"
            defaultValue={texts.normLineForIds.join(", ")}
          />
          <Textarea name="bewertungLine" label="Bewertungs-Zeile (unter dem Bestätigungstext)" defaultValue={texts.bewertungLine} rows={3} />
          <Input
            name="validityLine"
            label='Gültig-bis-Zeile (Platzhalter {validUntil})'
            defaultValue={texts.validityLine}
          />
          <Input
            name="leipzigDateLabel"
            label='Ausstellungszeile (Platzhalter {issuedAt})'
            defaultValue={texts.leipzigDateLabel}
          />
          <Textarea
            name="tnDefaultBody"
            label="Teilnahmebescheinigung – Standard-Beschreibungstext"
            defaultValue={texts.tnDefaultBody}
            rows={6}
          />
          <p className="text-xs text-slate-500 -mt-2">
            Wird auf Teilnahmebescheinigungen verwendet, wenn pro Veranstaltung kein eigener
            Text gesetzt ist. Absätze durch Leerzeile trennen.
          </p>
        </div>
        <button className="btn-primary">Allgemeine Texte speichern</button>
      </form>

      {/* Kompetenzfelder */}
      <h2 className="text-xl font-semibold mb-3">Kompetenzfelder</h2>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Pro Kompetenzfeld eine ID, eine Bezeichnung (wird mittig unter dem Titel ausgegeben) und der Bestätigungstext
        (beginnt sinnvoll mit „wird bestätigt, die theoretischen Kenntnisse …").
      </p>
      <form method="post" action="/api/admin/kompetenzfelder" className="space-y-4">
        <input type="hidden" name="count" value={items.length} />
        {items.map((k, i) => (
          <div key={k.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="text-xs font-mono text-slate-500">ID: {k.id}</span>
            </div>
            <input type="hidden" name={`id_${i}`} value={k.id} />
            <div className="grid gap-3">
              <Input name={`label_${i}`} label="Bezeichnung" defaultValue={k.label} />
              <Textarea name={`text_${i}`} label="Bestätigungstext" defaultValue={k.text} rows={3} />
            </div>
          </div>
        ))}
        <button className="btn-primary">Kompetenzfelder speichern</button>
      </form>
      <form method="post" action="/api/admin/kompetenzfelder/reset" className="mt-3">
        <button className="btn-secondary text-sm" type="submit">Auf Standard zurücksetzen</button>
      </form>
    </Shell>
  );
}

function Input(props: { name: string; label: string; defaultValue?: string; type?: string }) {
  return (
    <div>
      <label className="label">{props.label}</label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue ?? ""}
        className="input"
      />
    </div>
  );
}

function Textarea(props: { name: string; label: string; defaultValue?: string; rows?: number }) {
  return (
    <div>
      <label className="label">{props.label}</label>
      <textarea
        name={props.name}
        defaultValue={props.defaultValue ?? ""}
        rows={props.rows ?? 3}
        className="input"
      />
    </div>
  );
}
