"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES, type LeadStatus } from "@starpos-crm/shared";
import {
  ApiError,
  type CustomFieldDefinition,
  type MetaFormQuestion,
  type MetaLeadConnection,
  type MetaLeadDiscovery,
  type MetaLeadFormLink,
  type PlatformPublicConfig,
  connectMetaLeads,
  deleteMetaLeadForm,
  disconnectMetaLeads,
  getAccessToken,
  getMetaFormQuestions,
  getMetaLeadConnection,
  getPlatformPublicConfig,
  linkMetaLeadForm,
  listCustomFields,
  listMetaLeadForms,
  me,
  refreshMetaLeadConnection,
  syncMetaLeadForm,
  updateMetaLeadConnection,
  updateMetaLeadForm,
} from "../../../../lib/api";
import { ConnectMetaButton, FacebookGlyph } from "./ConnectMetaButton";
import { FieldMappingEditor, describeTarget } from "./FieldMappingEditor";
import { PageSkeleton } from "../../../../components/PageSkeleton";
import { PageHeader, SectionCard } from "../../../../components/ui";
import { CheckIcon, MegaphoneIcon, RefreshIcon } from "../../../../components/icons";
import { useAccess } from "../../../../components/AccessContext";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function describeDiscovery(found: MetaLeadDiscovery): string {
  const pages = `${found.pages} Page${found.pages === 1 ? "" : "s"}`;
  const forms = `${found.forms} lead form${found.forms === 1 ? "" : "s"}`;
  const fresh = found.newForms > 0 ? ` — ${found.newForms} newly linked` : "";
  return `Found ${pages} and ${forms}${fresh}.`;
}

/** Every distinct question across the given forms, for the connection-wide mapping. */
function unionQuestions(forms: MetaLeadFormLink[]): MetaFormQuestion[] {
  const byKey = new Map<string, MetaFormQuestion>();
  for (const form of forms) {
    for (const question of form.questions) {
      if (!byKey.has(question.key)) byKey.set(question.key, question);
    }
  }
  return Array.from(byKey.values());
}

export default function MetaLeadAdsPage() {
  const access = useAccess();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PlatformPublicConfig | null>(null);
  const [connection, setConnection] = useState<MetaLeadConnection | null>(null);
  const [links, setLinks] = useState<MetaLeadFormLink[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mappingFor, setMappingFor] = useState<string | null>(null);
  const [editingDefault, setEditingDefault] = useState(false);

  const canManage = access.canEdit("integrations");

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const meRes = await me();
        if (meRes.permissions.integrations !== "edit") return;
        const [configRes, connectionRes, linksRes, fieldsRes] = await Promise.all([
          getPlatformPublicConfig(),
          getMetaLeadConnection(),
          listMetaLeadForms(),
          listCustomFields("lead"),
        ]);
        setConfig(configRes);
        setConnection(connectionRes.connection);
        setLinks(linksRes);
        setFields(fieldsRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load Meta lead ads");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const connectedForms = useMemo(() => links.filter((link) => link.connectionId), [links]);
  const manualForms = useMemo(() => links.filter((link) => !link.connectionId), [links]);

  /** Forms grouped under their Page, in the order the connection lists the Pages. */
  const pageGroups = useMemo(() => {
    const groups = new Map<string, { pageId: string; pageName: string | null; forms: MetaLeadFormLink[] }>();
    for (const page of connection?.pages ?? []) {
      groups.set(page.pageId, { pageId: page.pageId, pageName: page.pageName, forms: [] });
    }
    for (const form of connectedForms) {
      const group = groups.get(form.pageId) ?? { pageId: form.pageId, pageName: form.pageName, forms: [] };
      group.forms.push(form);
      groups.set(form.pageId, group);
    }
    return Array.from(groups.values());
  }, [connection, connectedForms]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function reloadLinks() {
    setLinks(await listMetaLeadForms());
  }

  /** Called by the Facebook button; throwing shows the message under the button. */
  async function onLogin(credentials: { code?: string; accessToken?: string }) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await connectMetaLeads(credentials);
      setConnection(res.connection);
      await reloadLinks();
      setNotice(`Connected. ${describeDiscovery(res.discovered)}`);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Could not finish connecting to Meta");
    } finally {
      setBusy(false);
    }
  }

  function onRefresh() {
    void run(async () => {
      const res = await refreshMetaLeadConnection();
      setConnection(res.connection);
      await reloadLinks();
      setNotice(describeDiscovery(res.discovered));
    }, "Could not refresh from Meta");
  }

  function onDisconnect() {
    if (
      !window.confirm(
        "Disconnect Meta? Forms found through this login are unlinked and new submissions stop arriving. Leads already captured are kept.",
      )
    ) {
      return;
    }
    void run(async () => {
      const res = await disconnectMetaLeads();
      setConnection(null);
      await reloadLinks();
      setNotice(`Disconnected. ${res.formsRemoved} form${res.formsRemoved === 1 ? "" : "s"} unlinked.`);
    }, "Could not disconnect");
  }

  function onDefaultStatus(status: LeadStatus) {
    void run(async () => {
      const res = await updateMetaLeadConnection({ defaultStatus: status });
      setConnection(res.connection);
      setNotice("Saved. Forms found from now on use this status.");
    }, "Could not save");
  }

  function saveDefaultMapping(mapping: Record<string, string>) {
    void run(async () => {
      const res = await updateMetaLeadConnection({ defaultFieldMapping: mapping });
      setConnection(res.connection);
      setEditingDefault(false);
      setNotice("Field mapping saved. It applies to every form from now on.");
    }, "Could not save the mapping");
  }

  function replaceLink(updated: MetaLeadFormLink) {
    setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function onToggleActive(link: MetaLeadFormLink) {
    void run(async () => {
      replaceLink(await updateMetaLeadForm(link.id, { isActive: !link.isActive }));
    }, "Could not update this form");
  }

  function onSync(link: MetaLeadFormLink) {
    void run(async () => {
      const res = await syncMetaLeadForm(link.id);
      replaceLink(res.form);
      setNotice(
        res.created === 0
          ? "Nothing new — every recent submission on this form is already a lead."
          : `Pulled ${res.created} new lead${res.created === 1 ? "" : "s"} from Meta.`,
      );
    }, "Could not reach Meta for this form");
  }

  function onUnlink(link: MetaLeadFormLink) {
    if (!window.confirm(`Unlink ${link.formName ?? link.formId}? Leads already captured are kept.`)) return;
    void run(async () => {
      await deleteMetaLeadForm(link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      setNotice("Form unlinked.");
    }, "Could not unlink this form");
  }

  async function openMapping(link: MetaLeadFormLink) {
    const next = mappingFor === link.id ? null : link.id;
    setMappingFor(next);
    if (!next || link.questions.length > 0) return;
    try {
      const res = await getMetaFormQuestions(link.id);
      replaceLink({ ...link, questions: res.questions });
      if (res.warning) setNotice(res.warning);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read this form's questions");
    }
  }

  function saveFormMapping(link: MetaLeadFormLink, mapping: Record<string, string>) {
    void run(async () => {
      const updated = await updateMetaLeadForm(link.id, { fieldMapping: mapping });
      replaceLink({ ...updated, questions: updated.questions.length > 0 ? updated.questions : link.questions });
      setMappingFor(null);
      setNotice("Mapping saved for this form.");
    }, "Could not save the mapping");
  }

  if (loading) return <PageSkeleton />;

  if (!canManage) {
    return (
      <div>
        <h1 className="page-title">Meta lead ads</h1>
        <p className="mt-2 text-sm text-slate-500">
          Only an admin or owner can connect Meta lead ads to this workspace.
        </p>
      </div>
    );
  }

  function renderForm(link: MetaLeadFormLink) {
    const overrides = Object.keys(link.fieldMapping).length;
    return (
      <div key={link.id} className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
              {link.formName ?? `Form ${link.formId}`}
              <span className={`badge ${link.isActive ? "badge-success" : "badge-neutral"}`}>
                {link.isActive ? "Active" : "Paused"}
              </span>
              {overrides > 0 && <span className="badge badge-neutral">Own mapping</span>}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {link.leadCount} lead{link.leadCount === 1 ? "" : "s"} · last lead {formatDate(link.lastLeadAt)}
              {!link.connectionId && ` · Page ${link.pageId} · Form ${link.formId}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void openMapping(link)}>
              {mappingFor === link.id ? "Close mapping" : "Map fields"}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => onSync(link)}>
              Pull recent leads
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => onToggleActive(link)}>
              {link.isActive ? "Pause" : "Resume"}
            </button>
            {/* A connected form would just come back on the next refresh, so it is paused instead. */}
            {!link.connectionId && (
              <button type="button" className="btn-danger" disabled={busy} onClick={() => onUnlink(link)}>
                Unlink
              </button>
            )}
          </div>
        </div>

        {mappingFor === link.id && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-3 text-sm text-slate-500">
              Only for <span className="font-medium text-slate-700">{link.formName ?? link.formId}</span>. Rows left
              on the default follow the mapping for all forms.
            </p>
            <FieldMappingEditor
              questions={link.questions}
              fields={fields}
              mapping={link.fieldMapping}
              inherited={connection?.defaultFieldMapping}
              busy={busy}
              saveLabel="Save for this form"
              onSave={(mapping) => saveFormMapping(link, mapping)}
              onCancel={() => setMappingFor(null)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={MegaphoneIcon}
        tone="sky"
        title="Meta lead ads"
        subtitle="Log in with Facebook once and every lead form on your Pages sends its submissions straight to Leads."
        actions={
          <>
            <Link href="/dashboard/integrations" className="btn-secondary">
              All integrations
            </Link>
            {connection && (
              <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={busy} onClick={onRefresh}>
                <RefreshIcon className="h-4 w-4" />
                Refresh forms
              </button>
            )}
          </>
        }
      />

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">{notice}</p>}

      {!connection ? (
        <section className="card mt-6 overflow-hidden">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <span className="icon-chip h-12 w-12 rounded-2xl bg-[#1877F2] text-white">
                <FacebookGlyph className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-xl font-bold text-slate-900">Connect your Facebook account</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {[
                  "Every Page you choose, and every lead form on it, is linked automatically.",
                  "New submissions land on Leads within seconds — no Page ids or tokens to copy.",
                  "Map form questions to your lead fields once, for all forms.",
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <ConnectMetaButton config={config} disabled={busy} onLogin={onLogin} />
          </div>
        </section>
      ) : (
        <>
          <section className="card mt-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="icon-chip h-11 w-11 rounded-2xl bg-[#1877F2] text-white">
                  <FacebookGlyph className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                    {connection.fbUserName ?? "Facebook account"}
                    <span className="badge badge-success">Connected</span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {connection.pages.length} Page{connection.pages.length === 1 ? "" : "s"} ·{" "}
                    {connectedForms.length} form{connectedForms.length === 1 ? "" : "s"} · refreshed{" "}
                    {formatDate(connection.lastSyncAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <ConnectMetaButton
                  config={config}
                  disabled={busy}
                  label="Add Pages / reconnect"
                  className="btn-secondary"
                  onLogin={onLogin}
                />
                <button type="button" className="btn-danger" disabled={busy} onClick={onDisconnect}>
                  Disconnect
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <label className="text-sm text-slate-600" htmlFor="default-status">
                New leads arrive as
              </label>
              <select
                id="default-status"
                className="input w-48 capitalize"
                value={connection.defaultStatus}
                disabled={busy}
                onChange={(e) => onDefaultStatus(e.target.value as LeadStatus)}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">for forms found from now on</span>
            </div>

            {connection.lastError && (
              <p className="mt-4 whitespace-pre-line rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {connection.lastError}
              </p>
            )}
          </section>

          <SectionCard
            className="mt-6"
            title="Field mapping for all forms"
            subtitle="Choose which lead field each form question fills. Standard questions like full name, phone and email are matched for you."
            actions={
              !editingDefault && (
                <button type="button" className="btn-secondary" onClick={() => setEditingDefault(true)}>
                  {Object.keys(connection.defaultFieldMapping).length > 0 ? "Edit mapping" : "Map fields"}
                </button>
              )
            }
          >
            {editingDefault ? (
              <FieldMappingEditor
                questions={unionQuestions(connectedForms)}
                fields={fields}
                mapping={connection.defaultFieldMapping}
                busy={busy}
                saveLabel="Save for all forms"
                onSave={saveDefaultMapping}
                onCancel={() => setEditingDefault(false)}
              />
            ) : (
              <MappingSummary mapping={connection.defaultFieldMapping} questions={unionQuestions(connectedForms)} fields={fields} />
            )}
          </SectionCard>

          <div className="mt-6 space-y-4">
            {pageGroups.length === 0 ? (
              <p className="text-sm text-slate-500">
                No Pages came back from Facebook. Use “Add Pages / reconnect” and tick the Pages whose lead forms
                you want here.
              </p>
            ) : (
              pageGroups.map((group) => {
                const page = connection.pages.find((p) => p.pageId === group.pageId);
                return (
                  <SectionCard
                    key={group.pageId}
                    title={group.pageName ?? `Page ${group.pageId}`}
                    subtitle={
                      page?.lastError ? (
                        <span className="text-amber-700">{page.lastError}</span>
                      ) : page?.subscribed ? (
                        "Receiving leads in real time"
                      ) : (
                        "Not subscribed to lead notifications — use Pull recent leads, or refresh"
                      )
                    }
                    bodyClassName="divide-y divide-slate-100"
                  >
                    {group.forms.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-slate-500">
                        No lead forms on this Page yet. A form you create later links itself when its first lead
                        arrives.
                      </p>
                    ) : (
                      group.forms.map(renderForm)
                    )}
                  </SectionCard>
                );
              })
            )}
          </div>
        </>
      )}

      {manualForms.length > 0 && (
        <SectionCard
          className="mt-6"
          title="Linked by hand"
          subtitle="Forms linked with a pasted Page token. Connecting with Facebook adopts any of these it can see."
          bodyClassName="divide-y divide-slate-100"
        >
          {manualForms.map(renderForm)}
        </SectionCard>
      )}

      <ManualLinkForm
        busy={busy}
        onLinked={(form, warning) => {
          setLinks((prev) => [form, ...prev]);
          setNotice(warning ? `Form linked, but ${warning}` : "Form linked. New submissions will arrive as leads.");
          setMappingFor(form.id);
        }}
        onError={setError}
      />
    </div>
  );
}

/** A read-only view of the connection-wide mapping. */
function MappingSummary({
  mapping,
  questions,
  fields,
}: {
  mapping: Record<string, string>;
  questions: MetaFormQuestion[];
  fields: CustomFieldDefinition[];
}) {
  const entries = Object.entries(mapping);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Everything is matched automatically for now
        {questions.length > 0 ? ` across ${questions.length} question${questions.length === 1 ? "" : "s"}` : ""}.
        Anything left unmatched is added to the lead&rsquo;s notes.
      </p>
    );
  }
  const labelFor = new Map(questions.map((q) => [q.key, q.label]));
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {entries.map(([question, target]) => (
        <li key={question} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="truncate text-slate-700">{labelFor.get(question) ?? question}</span>
          <span className="shrink-0 font-medium text-brand-800">{describeTarget(target, fields)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The original paste-a-token flow, kept for Pages the Facebook login can't reach. */
function ManualLinkForm({
  busy,
  onLinked,
  onError,
}: {
  busy: boolean;
  onLinked: (form: MetaLeadFormLink, warning?: string) => void;
  onError: (message: string | null) => void;
}) {
  const [pageId, setPageId] = useState("");
  const [formId, setFormId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const res = await linkMetaLeadForm({
        pageId: pageId.trim(),
        formId: formId.trim(),
        pageAccessToken: pageAccessToken.trim(),
      });
      onLinked(res.form, res.warning);
      setPageId("");
      setFormId("");
      setPageAccessToken("");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not link this form");
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;
  return (
    <details className="card mt-6 p-5">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        Advanced: link a single form with a Page token
      </summary>
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <p className="text-sm text-slate-500">
          Only needed for a Page the Facebook login can&rsquo;t reach. Paste a Page access token with the{" "}
          <span className="font-medium">leads_retrieval</span> permission; it is stored encrypted.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="page-id">
              Page id
            </label>
            <input id="page-id" className="input" inputMode="numeric" autoComplete="off" required value={pageId} disabled={disabled} onChange={(e) => setPageId(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="form-id">
              Lead form id
            </label>
            <input id="form-id" className="input" inputMode="numeric" autoComplete="off" required value={formId} disabled={disabled} onChange={(e) => setFormId(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="page-token">
              Page access token
            </label>
            <input
              id="page-token"
              className="input"
              type="password"
              autoComplete="off"
              required
              value={pageAccessToken}
              disabled={disabled}
              onChange={(e) => setPageAccessToken(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn-secondary"
          disabled={disabled || !pageId.trim() || !formId.trim() || !pageAccessToken.trim()}
        >
          {saving ? "Linking…" : "Link form"}
        </button>
      </form>
    </details>
  );
}
