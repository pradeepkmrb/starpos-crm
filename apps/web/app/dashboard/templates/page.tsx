"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Channel,
  type MessageTemplate,
  createTemplate,
  deleteTemplate,
  getAccessToken,
  listChannels,
  listTemplates,
  me,
  syncTemplates,
  updateTemplate,
} from "../../../lib/api";
import { PageSkeleton } from "../../../components/PageSkeleton";

const STATUS_BADGE: Record<MessageTemplate["status"], string> = {
  draft: "badge-neutral",
  pending: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
};

type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION";

const CATEGORIES: Category[] = ["MARKETING", "UTILITY", "AUTHENTICATION"];

/**
 * Meta accepts only lowercase letters, digits and underscores in a template
 * name, and answers anything else with a bare "Invalid parameter" that names
 * no field. Normalising as the operator types means they cannot hit it.
 */
function normalizeTemplateName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** One entry of Meta's template component array, as far as the preview cares. */
interface TemplateComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: { text?: string; type?: string }[];
}

function componentsOf(template: MessageTemplate): TemplateComponent[] {
  return (template.bodyJson?.components ?? []) as TemplateComponent[];
}

function componentOfType(template: MessageTemplate, type: string): TemplateComponent | undefined {
  return componentsOf(template).find((c) => c.type?.toUpperCase() === type);
}

/** The body text lives inside the stored Meta component payload. */
function bodyTextOf(template: MessageTemplate): string {
  return componentOfType(template, "BODY")?.text ?? "";
}

/** Synced templates can carry a category we don't offer — fall back rather than mis-select. */
function categoryOf(template: MessageTemplate): Category {
  const upper = template.category.toUpperCase() as Category;
  return CATEGORIES.includes(upper) ? upper : "MARKETING";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function TemplatesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [previewing, setPreviewing] = useState<MessageTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, templatesRes, channelsRes] = await Promise.all([me(), listTemplates(), listChannels()]);
        setRole(meRes.role);
        setTemplates(templatesRes);
        setChannels(channelsRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load templates");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        t.status.includes(q),
    );
  }, [templates, search]);

  async function onSync() {
    setNotice(null);
    setError(null);
    setSyncing(true);
    try {
      const result = await syncTemplates();
      setTemplates(result.templates);
      setNotice(
        result.imported === 0 && result.updated === 0
          ? "Already up to date — nothing new in Meta."
          : `Imported ${result.imported}, refreshed ${result.updated} from Meta.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to sync templates from Meta");
    } finally {
      setSyncing(false);
    }
  }

  /** Hands the broadcast form everything it needs so the user isn't retyping the template. */
  function startCampaign(template: MessageTemplate) {
    const params = new URLSearchParams({
      template: template.name,
      language: template.language,
      channelId: template.channelId,
    });
    router.push(`/dashboard/campaigns?${params.toString()}`);
  }

  async function onDelete(template: MessageTemplate) {
    const confirmed = window.confirm(
      `Delete "${template.name}"? This removes it from Meta as well and cannot be undone.`,
    );
    if (!confirmed) return;

    setNotice(null);
    setError(null);
    setDeletingId(template.id);
    try {
      await deleteTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      setNotice(`Deleted "${template.name}".`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <PageSkeleton />;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Message Library</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create WhatsApp message templates here — they&apos;re submitted to Meta for approval and this list
            updates automatically once Meta approves or rejects them.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setCreating((v) => !v);
              }}
              className="btn-primary"
              disabled={channels.length === 0}
            >
              Create template
            </button>
            <button
              type="button"
              onClick={onSync}
              disabled={syncing || channels.length === 0}
              className="btn-secondary"
            >
              {syncing ? "Syncing…" : "Sync from Meta"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}

      {templates.length > 0 && (
        <div className="mt-6 flex justify-end">
          <input
            className="input w-64"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <section className="mt-3">
        {templates.length === 0 ? (
          <p className="text-sm text-slate-500">
            No templates yet — create your first one, or use{" "}
            <span className="font-medium">Sync from Meta</span> to pull in templates that already exist on
            your WhatsApp Business account.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">No templates match “{search}”.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Language</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Updated on</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600">{t.language}</td>
                    <td className="px-4 py-3 uppercase text-slate-600">{t.category}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_BADGE[t.status]} capitalize`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(t.updatedAt)}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startCampaign(t)}
                            disabled={t.status !== "approved"}
                            title={
                              t.status === "approved"
                                ? "Launch a broadcast with this template"
                                : "Meta only delivers approved templates"
                            }
                            className="btn-primary"
                          >
                            Create Campaign
                          </button>
                          <button type="button" onClick={() => setPreviewing(t)} className="btn-secondary">
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCreating(false);
                              setEditing(t);
                            }}
                            className="btn-secondary"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(t)}
                            disabled={deletingId === t.id}
                            className="btn-danger"
                          >
                            {deletingId === t.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && channels.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">
          Connect a WhatsApp channel first — templates are submitted through a channel&apos;s WABA.
        </p>
      )}

      {previewing && (
        <TemplatePreview template={previewing} onClose={() => setPreviewing(null)} />
      )}

      {canManage && editing && (
        <EditTemplateForm
          key={editing.id}
          template={editing}
          onCancel={() => setEditing(null)}
          onSaved={(updated) => {
            setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setEditing(null);
            setNotice(`Saved "${updated.name}" — Meta will review the change.`);
          }}
        />
      )}

      {canManage && creating && channels.length > 0 && (
        <CreateTemplateForm
          channels={channels}
          onCancel={() => setCreating(false)}
          onCreated={(t) => {
            setTemplates((prev) => [t, ...prev]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Renders the stored Meta components as the message would land on a handset.
 * Variable placeholders stay literal — there are no sample values to fill in
 * until a campaign supplies them.
 */
function TemplatePreview({ template, onClose }: { template: MessageTemplate; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const header = componentOfType(template, "HEADER");
  const body = componentOfType(template, "BODY");
  const footer = componentOfType(template, "FOOTER");
  const buttons = componentOfType(template, "BUTTONS")?.buttons ?? [];
  const headerFormat = header?.format?.toUpperCase() ?? "TEXT";

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${template.name}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{template.name}</h2>
            <p className="text-xs text-slate-500">
              {template.category} · {template.language}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
            Close
          </button>
        </div>

        <div className="mt-4 rounded-lg bg-slate-100 p-4">
          <div className="rounded-lg bg-white p-3 shadow-card">
            {header && (
              <div className="mb-2">
                {headerFormat === "TEXT" ? (
                  <p className="font-semibold text-slate-900">{header.text}</p>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    {headerFormat} header
                  </div>
                )}
              </div>
            )}

            <p className="whitespace-pre-wrap text-sm text-slate-800">
              {body?.text || <span className="text-slate-400">No body text</span>}
            </p>

            {footer?.text && <p className="mt-2 text-xs text-slate-400">{footer.text}</p>}
          </div>

          {buttons.length > 0 && (
            <div className="mt-2 space-y-1">
              {buttons.map((b, i) => (
                <div
                  key={`${b.text}-${i}`}
                  className="rounded-lg bg-white py-2 text-center text-sm font-medium text-brand-800 shadow-card"
                >
                  {b.text}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Placeholders like <code>{"{{1}}"}</code> are filled in when a campaign sends the message.
        </p>
      </div>
    </div>
  );
}

function CreateTemplateForm({
  channels,
  onCreated,
  onCancel,
}: {
  channels: Channel[];
  onCreated: (template: MessageTemplate) => void;
  onCancel: () => void;
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("MARKETING");
  const [language, setLanguage] = useState("en_US");
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      onCreated(await createTemplate({ channelId, name, category, language, bodyText }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create template");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Create template</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="field-label">Channel</span>
          <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayPhoneNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Template name</span>
          <input
            required
            className="input"
            placeholder="order_update"
            value={name}
            onChange={(e) => setName(normalizeTemplateName(e.target.value))}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Lowercase letters, numbers and underscores only — Meta&apos;s rule. Spaces become underscores.
          </span>
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="field-label">Category</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">Language</span>
            <input className="input" value={language} onChange={(e) => setLanguage(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="field-label">Body text</span>
          <textarea
            required
            className="input"
            rows={3}
            placeholder="Hi {{1}}, your order has shipped."
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Submitting…" : "Submit to Meta"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function EditTemplateForm({
  template,
  onSaved,
  onCancel,
}: {
  template: MessageTemplate;
  onSaved: (template: MessageTemplate) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<Category>(categoryOf(template));
  const [bodyText, setBodyText] = useState(bodyTextOf(template));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      onSaved(await updateTemplate(template.id, { bodyText, category }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update template");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Edit “{template.name}”</h2>
      <p className="mt-1 text-sm text-slate-500">
        Meta treats the name and language as fixed, so only the body and category can change. Saving sends
        the template back for review.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="field-label">Name</span>
            <input className="input" value={template.name} disabled />
          </label>
          <label className="block">
            <span className="field-label">Language</span>
            <input className="input" value={template.language} disabled />
          </label>
          <label className="block">
            <span className="field-label">Category</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="field-label">Body text</span>
          <textarea
            required
            className="input"
            rows={3}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
