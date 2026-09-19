"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES, roleAtLeast, type LeadStatus, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type CustomFieldDefinition,
  type MetaFormQuestion,
  type MetaLeadFormLink,
  deleteMetaLeadForm,
  getAccessToken,
  getMetaFormQuestions,
  linkMetaLeadForm,
  listCustomFields,
  listMetaLeadForms,
  me,
  syncMetaLeadForm,
  updateMetaLeadForm,
} from "../../../lib/api";
import { FieldMappingEditor } from "./FieldMappingEditor";
import { PageSkeleton } from "../../../components/PageSkeleton";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function LeadSourcesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [links, setLinks] = useState<MetaLeadFormLink[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [questionsByLink, setQuestionsByLink] = useState<Record<string, MetaFormQuestion[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [mappingFor, setMappingFor] = useState<string | null>(null);

  const [pageId, setPageId] = useState("");
  const [formId, setFormId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [pageName, setPageName] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<LeadStatus>("new");

  const canManage = role ? roleAtLeast(role, "admin") : false;

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const meRes = await me();
        setRole(meRes.role);
        if (!roleAtLeast(meRes.role, "admin")) return;
        const [linksRes, fieldsRes] = await Promise.all([listMetaLeadForms(), listCustomFields("lead")]);
        setLinks(linksRes);
        setFields(fieldsRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load lead sources");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function onLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await linkMetaLeadForm({
        pageId: pageId.trim(),
        formId: formId.trim(),
        pageAccessToken: pageAccessToken.trim(),
        pageName: pageName.trim() || undefined,
        defaultStatus,
      });
      setLinks((prev) => [res.form, ...prev]);
      setQuestionsByLink((prev) => ({ ...prev, [res.form.id]: res.questions }));
      setNotice(
        res.warning
          ? `Form linked, but ${res.warning}`
          : "Form linked. New submissions will arrive as leads.",
      );
      setPageId("");
      setFormId("");
      setPageAccessToken("");
      setPageName("");
      setFormOpen(false);
      setMappingFor(res.form.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not link this form");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(link: MetaLeadFormLink) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMetaLeadForm(link.id, { isActive: !link.isActive });
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this form");
    } finally {
      setBusy(false);
    }
  }

  async function onSync(link: MetaLeadFormLink) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await syncMetaLeadForm(link.id);
      setLinks((prev) => prev.map((l) => (l.id === res.form.id ? res.form : l)));
      setNotice(
        res.created === 0
          ? "Nothing new — every recent submission on this form is already a lead."
          : `Pulled ${res.created} new lead${res.created === 1 ? "" : "s"} from Meta.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach Meta for this form");
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink(link: MetaLeadFormLink) {
    if (
      !window.confirm(
        `Unlink ${link.formName ?? link.formId}? New submissions stop arriving. Leads already captured are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMetaLeadForm(link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      setNotice("Form unlinked.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not unlink this form");
    } finally {
      setBusy(false);
    }
  }

  async function openMapping(link: MetaLeadFormLink) {
    const next = mappingFor === link.id ? null : link.id;
    setMappingFor(next);
    if (!next || questionsByLink[link.id]) return;
    try {
      const res = await getMetaFormQuestions(link.id);
      setQuestionsByLink((prev) => ({ ...prev, [link.id]: res.questions }));
      if (res.warning) setNotice(res.warning);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read this form's questions");
    }
  }

  async function saveMapping(link: MetaLeadFormLink, mapping: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMetaLeadForm(link.id, { fieldMapping: mapping });
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setNotice("Mapping saved.");
      setMappingFor(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the mapping");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageSkeleton />;

  if (!canManage) {
    return (
      <div>
        <h1 className="page-title">Meta lead ads</h1>
        <p className="mt-2 text-sm text-slate-500">
          Only an admin or owner can connect a Meta lead ad form to this workspace.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Meta lead ads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Link an instant-form lead ad and every submission lands on the Leads screen, mapped onto your
            own fields.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? "Close" : "Link a form"}
          </button>
          <Link href="/dashboard/leads" className="btn-secondary">
            Back to leads
          </Link>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}

      {formOpen && (
        <form className="card mt-5 space-y-4 p-5" onSubmit={onLink}>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Link a lead form</h2>
            <p className="mt-1 text-sm text-slate-500">
              Take the Page id and form id from Meta Business Suite, and a Page access token that carries
              the <span className="font-medium">leads_retrieval</span> permission. The token is stored
              encrypted and never sent back to this screen.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="page-id">
                Page id <span className="text-red-500">*</span>
              </label>
              <input
                id="page-id"
                className="input"
                required
                value={pageId}
                disabled={busy}
                onChange={(e) => setPageId(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="form-id">
                Lead form id <span className="text-red-500">*</span>
              </label>
              <input
                id="form-id"
                className="input"
                required
                value={formId}
                disabled={busy}
                onChange={(e) => setFormId(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="page-token">
                Page access token <span className="text-red-500">*</span>
              </label>
              <input
                id="page-token"
                className="input"
                type="password"
                required
                value={pageAccessToken}
                disabled={busy}
                onChange={(e) => setPageAccessToken(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="page-name">
                Page name
              </label>
              <input
                id="page-name"
                className="input"
                placeholder="Optional, for your own reference"
                value={pageName}
                disabled={busy}
                onChange={(e) => setPageName(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="default-status">
                Leads arrive as
              </label>
              <select
                id="default-status"
                className="input capitalize"
                value={defaultStatus}
                disabled={busy}
                onChange={(e) => setDefaultStatus(e.target.value as LeadStatus)}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status} className="capitalize">
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !pageId.trim() || !formId.trim() || !pageAccessToken.trim()}
          >
            Link form
          </button>
        </form>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Linked forms</h2>
        {links.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No forms linked yet. Link one and new submissions arrive as leads within seconds of someone
            tapping submit.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {links.map((link) => (
              <div key={link.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {link.formName ?? `Form ${link.formId}`}
                      <span className={`ml-2 badge ${link.isActive ? "badge-success" : "badge-neutral"}`}>
                        {link.isActive ? "Active" : "Paused"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {link.pageName ? `${link.pageName} · ` : ""}Page {link.pageId} · Form {link.formId}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {link.leadCount} lead{link.leadCount === 1 ? "" : "s"} captured · last lead{" "}
                      {formatDate(link.lastLeadAt)} · last pull {formatDate(link.lastSyncAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void openMapping(link)}
                    >
                      {mappingFor === link.id ? "Close mapping" : "Map fields"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void onSync(link)}
                    >
                      Pull recent leads
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void onToggleActive(link)}
                    >
                      {link.isActive ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={busy}
                      onClick={() => void onUnlink(link)}
                    >
                      Unlink
                    </button>
                  </div>
                </div>

                {mappingFor === link.id && (
                  <FieldMappingEditor
                    questions={questionsByLink[link.id] ?? []}
                    fields={fields}
                    mapping={link.fieldMapping}
                    busy={busy}
                    onSave={(mapping) => void saveMapping(link, mapping)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mt-8 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Wiring the webhook</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>
            In your Meta app, subscribe the webhook to the <span className="font-medium">leadgen</span>{" "}
            field on the Page object, pointing at the same <code>/webhooks/meta</code> URL this app
            already uses for WhatsApp.
          </li>
          <li>Subscribe the Page itself to your app so Meta starts sending its lead events.</li>
          <li>
            Link the form above with a Page token that has <span className="font-medium">leads_retrieval</span>.
          </li>
          <li>
            Submissions from before the webhook was wired are not lost — use{" "}
            <span className="font-medium">Pull recent leads</span> to fetch them.
          </li>
        </ol>
      </section>
    </div>
  );
}
