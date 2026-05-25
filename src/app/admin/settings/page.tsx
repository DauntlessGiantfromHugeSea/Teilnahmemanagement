import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { getIframeHosts, buildFrameAncestors } from "@/lib/iframeHosts";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const hosts = getIframeHosts();
  const csp = buildFrameAncestors(hosts);

  const hasEnv = !!process.env.IFRAME_HOSTS?.trim();

  return (
    <Shell session={s} active="">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-slate-500 mt-1 mb-8">
          Server-seitige Konfiguration. Änderungen erfordern aktuell einen
          Container-Neustart (
          <code className="font-mono text-xs">docker compose up -d app</code>).
        </p>

        <section className="card p-6 mb-6">
          <h2 className="font-semibold mb-1">Iframe-Einbettung erlauben</h2>
          <p className="text-xs text-slate-500 mb-4">
            Auf welchen Domains darf die öffentliche Anmeldeseite
            (
            <code className="font-mono text-[11px]">/anmeldung/&lt;event-id&gt;</code>
            ) per <code className="font-mono text-[11px]">&lt;iframe&gt;</code>{" "}
            eingebettet werden? Subdomains sind automatisch erlaubt.
          </p>

          <div className="mb-4">
            <label className="label">Aktuell erlaubte Hosts</label>
            <div className="flex flex-wrap gap-2">
              {hosts.length === 0 ? (
                <span className="text-sm text-slate-500">Keine Hosts gesetzt – Embedding ist deaktiviert.</span>
              ) : (
                hosts.map((h) => (
                  <span
                    key={h}
                    className="badge bg-brand-50 text-brand-700 border border-brand-100"
                  >
                    {h} <span className="text-slate-400 ml-1">+ *.{h}</span>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="mb-4">
            <label className="label">Gesendeter CSP-Header (Read-only)</label>
            <code className="block font-mono text-[11px] bg-slate-100 px-3 py-2 rounded break-all">
              Content-Security-Policy: frame-ancestors {csp}
            </code>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm">
            <div className="font-semibold mb-1">Hosts ändern</div>
            <p className="text-slate-600">
              In der <code className="font-mono text-xs">.env</code> auf dem Server
              die Variable{" "}
              <code className="font-mono text-xs">IFRAME_HOSTS</code> setzen
              (Leerzeichen- oder kommagetrennt, ohne <code className="font-mono text-xs">https://</code>):
            </p>
            <pre className="font-mono text-[11px] bg-white border border-slate-200 mt-2 px-3 py-2 rounded overflow-x-auto">
{`IFRAME_HOSTS="fb-eng.de fb-stage.de fi-fb.de meine-neue-domain.de"`}
            </pre>
            <p className="text-slate-600 mt-2">
              Anschließend:
            </p>
            <pre className="font-mono text-[11px] bg-white border border-slate-200 mt-1 px-3 py-2 rounded overflow-x-auto">
{`docker compose up -d app`}
            </pre>
            <p className="text-slate-600 mt-2">
              Status der Variable: {" "}
              {hasEnv ? (
                <span className="font-semibold text-emerald-700">gesetzt</span>
              ) : (
                <span className="font-semibold text-amber-700">
                  nicht gesetzt – es gelten die Defaults oben
                </span>
              )}
            </p>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Test: in WordPress eine Seite mit{" "}
            <code className="font-mono">&lt;iframe src="https://teilnahme.fb-akademie.de/anmeldung/&lt;event-id&gt;"&gt;&lt;/iframe&gt;</code>{" "}
            einbetten. In den DevTools (Network → Headers) muss der CSP-Header
            mit deiner Domain enthalten sein.
          </div>
        </section>
      </div>
    </Shell>
  );
}
