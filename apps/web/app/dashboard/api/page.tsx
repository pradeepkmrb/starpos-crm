"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  API_BASE_URL,
  getAccessToken,
  getApiKey,
  me,
  regenerateApiKey,
  type ApiKeyRecord,
} from "../../../lib/api";
import { CopyIcon, EyeIcon, EyeOffIcon, RefreshIcon } from "../../../components/icons";
import {
  curlFor,
  ENDPOINT_SECTIONS,
  ERROR_CODES,
  ERROR_ENVELOPE,
  type Endpoint,
  type HttpMethod,
} from "./endpoints";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { PageHeader } from "../../../components/ui";
import { CodeIcon as CodeHeaderIcon } from "../../../components/icons";

const PUBLIC_API_BASE = `${API_BASE_URL}/api/v1`;

/** Stand-in used in the examples until the operator chooses to reveal the key. */
const KEY_PLACEHOLDER = "YOUR_API_KEY";

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-sky-50 text-sky-700 ring-sky-200",
  POST: "bg-brand-50 text-brand-800 ring-brand-200",
  PATCH: "bg-amber-50 text-amber-800 ring-amber-200",
};

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function ApiDevelopersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [apiKey, setApiKey] = useState<ApiKeyRecord | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }

    me()
      .then(async (profile) => {
        setRole(profile.role);
        // Only admins and owners may read the key; everyone else still gets
        // the reference, with the examples using a placeholder.
        if (roleAtLeast(profile.role, "admin")) {
          setApiKey(await getApiKey());
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load your API key");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const canManage = role ? roleAtLeast(role, "admin") : false;
  const exampleKey = revealed && apiKey ? apiKey.key : KEY_PLACEHOLDER;

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 2000);
    } catch {
      setError("Your browser blocked clipboard access — select the text and copy it manually.");
    }
  }, []);

  async function handleRegenerate() {
    const confirmed = window.confirm(
      "Regenerating revokes the current key immediately. Anything using it stops working until you update it. Continue?",
    );
    if (!confirmed) return;

    setRegenerating(true);
    setError(null);
    setNotice(null);
    try {
      const next = await regenerateApiKey();
      setApiKey(next);
      setRevealed(true);
      setNotice("New key issued. Copy it into your integration — the old key no longer works.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate the key");
    } finally {
      setRegenerating(false);
    }
  }

  const sectionLinks = useMemo(
    () => ENDPOINT_SECTIONS.map((section) => ({ id: section.id, title: section.title })),
    [],
  );

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        icon={CodeHeaderIcon}
        tone="slate"
        title="API and developers"
        subtitle="Send WhatsApp messages, manage contacts and read templates from your own systems. One key, one base URL, no SDK."
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {notice}
        </div>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Your API key</h2>
          {apiKey?.lastUsedAt && (
            <span className="text-xs text-slate-500">
              Last used {new Date(apiKey.lastUsedAt).toLocaleString()}
            </span>
          )}
        </div>

        {canManage && apiKey ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800">
                {revealed ? apiKey.key : "•".repeat(48)}
              </code>
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="btn-secondary"
                aria-label={revealed ? "Hide API key" : "Show API key"}
                title={revealed ? "Hide key" : "Show key"}
              >
                {revealed ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => copy("key", apiKey.key)}
                className="btn-secondary"
                aria-label="Copy API key"
                title="Copy key"
              >
                <CopyIcon className="h-4 w-4" />
                {copied === "key" ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="btn-primary"
              >
                <RefreshIcon className="h-4 w-4" />
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Send this header with every request:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                X-API-Key: {"{your key}"}
              </code>{" "}
              · Base URL:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                {PUBLIC_API_BASE}
              </code>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Reveal the key to paste it into the examples below. Treat it like a password: it acts for
              this whole workspace, so keep it server-side and never ship it in a browser or mobile app.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Only workspace admins and owners can view or regenerate the API key. The reference below is
            complete — ask an admin for the key when you are ready to call it. Base URL:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
              {PUBLIC_API_BASE}
            </code>
          </p>
        )}
      </section>

      <nav className="flex flex-wrap gap-2">
        {sectionLinks.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-800"
          >
            {link.title}
          </a>
        ))}
        <a
          href="#errors"
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-800"
        >
          Errors &amp; limits
        </a>
      </nav>

      {ENDPOINT_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3">
          <h2 className="border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
            {section.title}
          </h2>
          {section.blurb && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              {section.blurb}
            </p>
          )}
          {section.endpoints.map((endpoint) => (
            <EndpointCard
              key={`${endpoint.method} ${endpoint.path}`}
              endpoint={endpoint}
              apiKey={exampleKey}
              copied={copied}
              onCopy={copy}
            />
          ))}
        </section>
      ))}

      <section id="errors" className="scroll-mt-24 space-y-3">
        <h2 className="border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
          Errors &amp; limits
        </h2>
        <div className="card p-5">
          <p className="text-sm text-slate-600">
            Every failed request answers with the same envelope, so you can branch on{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">error.code</code> rather
            than parsing the message.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
            {pretty(ERROR_ENVELOPE)}
          </pre>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">HTTP</th>
                  <th className="py-2 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {ERROR_CODES.map((row) => (
                  <tr key={row.code} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-800">{row.code}</td>
                    <td className="py-2 pr-4 text-slate-500">{row.status}</td>
                    <td className="py-2 text-slate-600">{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-sm text-slate-600">
            Responses carry{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">X-RateLimit-Limit</code>,{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">X-RateLimit-Remaining</code>{" "}
            and{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">X-RateLimit-Reset</code>.
            Separately, each message you send counts against your plan&apos;s monthly API allowance — see
            Plan &amp; Usage for where you stand.
          </p>
        </div>
      </section>
    </div>
  );
}

function EndpointCard({
  endpoint,
  apiKey,
  copied,
  onCopy,
}: {
  endpoint: Endpoint;
  apiKey: string;
  copied: string | null;
  onCopy: (label: string, text: string) => void;
}) {
  const label = `${endpoint.method} ${endpoint.path}`;
  const curl = curlFor(endpoint, PUBLIC_API_BASE, apiKey);

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ring-1 ring-inset ${METHOD_STYLES[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <code className="font-mono text-sm font-medium text-slate-900">{endpoint.path}</code>
      </div>

      <p className="mt-2 text-sm text-slate-600">{endpoint.summary}</p>
      {endpoint.note && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {endpoint.note}
        </p>
      )}

      <div className="relative mt-3">
        <button
          type="button"
          onClick={() => onCopy(label, curl)}
          className="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-white/20"
        >
          {copied === label ? "Copied" : "Copy"}
        </button>
        <pre className="overflow-x-auto rounded-lg bg-ink-900 p-4 pr-16 font-mono text-xs leading-relaxed text-slate-100">
          {curl}
        </pre>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">
          Sample response
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
          {pretty(endpoint.response)}
        </pre>
      </details>
    </article>
  );
}
