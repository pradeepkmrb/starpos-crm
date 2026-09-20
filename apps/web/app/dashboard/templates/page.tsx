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
import { Drawer } from "../../../components/Drawer";
import { useToast } from "../../../components/Toaster";
import { EmptyState, PageHeader } from "../../../components/ui";
import { DocumentIcon, MegaphoneIcon, PlugIcon, PlusIcon, RefreshIcon, SearchIcon } from "../../../components/icons";
import Link from "next/link";

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
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type StatusFilter = "all" | MessageTemplate["status"];
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "In review" },
  { key: "rejected", label: "Rejected" },
  { key: "draft", label: "Draft" },
];

const CATEGORY_TONE: Record<string, string> = {
  MARKETING: "bg-violet-50 text-violet-700",
  UTILITY: "bg-sky-50 text-sky-700",
  AUTHENTICATION: "bg-amber-50 text-amber-700",
};

/** {{1}} placeholders as small chips, so a reader sees where the variables go. */
function withPlaceholders(text: string) {
  return text.split(/(\{\{\d+\}\})/g).map((part, i) =>
    /^\{\{\d+\}\}$/.test(part) ? (
      <span key={i} className="rounded bg-brand-100 px-1 font-mono text-[11px] font-semibold text-brand-800">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** The template as it lands in a WhatsApp chat: header, body, footer and buttons. */
function TemplateBubble({
  header,
  body,
  footer,
  buttons,
  clamp,
}: {
  header?: TemplateComponent;
  body: string;
  footer?: string;
  buttons: { text?: string }[];
  clamp?: boolean;
}) {
  const headerFormat = header?.format?.toUpperCase() ?? "TEXT";
  return (
    <div
      className="rounded-2xl bg-[#eef2ef] p-3"
      style={{ backgroundImage: "radial-gradient(rgba(5,150,105,0.08) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
    >
      <div className="max-w-[92%] rounded-xl rounded-tl-sm bg-white p-2.5 shadow-sm">
        {header &&
          (headerFormat === "TEXT" ? (
            <p className="mb-1 text-sm font-bold text-slate-900">{header.text}</p>
          ) : (
            <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {headerFormat}
            </div>
          ))}
        <p className={`whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 ${clamp ? "line-clamp-4" : ""}`}>
          {body ? withPlaceholders(body) : <span className="text-slate-400">Your message appears here</span>}
        </p>
        {footer && <p className="mt-1 text-[11px] text-slate-400">{footer}</p>}
        <p className="mt-0.5 text-right text-[10px] text-slate-400">10:24</p>
      </div>
      {buttons.length > 0 && (
        <div className="mt-1 max-w-[92%] space-y-1">
          {buttons.map((b, i) => (
            <div key={`${b.text}-${i}`} className="rounded-xl bg-white py-1.5 text-center text-[13px] font-semibold text-sky-600 shadow-sm">
              {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const setNotice = (message: string | null) => {
    if (message) toast(message);
  };
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
    const inStatus = statusFilter === "all" ? templates : templates.filter((t) => t.status === statusFilter);
    if (!q) return inStatus;
    return inStatus.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        t.status.includes(q),
    );
  }, [templates, search, statusFilter]);

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

  const countOf = (key: StatusFilter) => (key === "all" ? templates.length : templates.filter((t) => t.status === key).length);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DocumentIcon}
        tone="violet"
        title="Message library"
        subtitle="WhatsApp templates you can broadcast. New ones go to Meta for review, and their status here updates by itself."
        actions={
          canManage && (
            <>
              <button type="button" onClick={onSync} disabled={syncing || channels.length === 0} className="btn-secondary">
                <RefreshIcon className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync from Meta"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreating(true);
                }}
                className="btn-primary"
                disabled={channels.length === 0}
              >
                <PlusIcon className="h-4 w-4" />
                New template
              </button>
            </>
          )
        }
      />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {channels.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={PlugIcon}
            tone="violet"
            title="Connect WhatsApp first"
            text="Templates are submitted to Meta through your WhatsApp Business number."
            action={
              <Link href="/dashboard/channels" className="btn-primary">
                Go to Connections
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-card">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    statusFilter === f.key ? "bg-brand-600 text-white" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {f.label} <span className={statusFilter === f.key ? "text-white/70" : "text-slate-400"}>{countOf(f.key)}</span>
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input py-2 pl-9" placeholder="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={DocumentIcon}
                tone="violet"
                title="No templates yet"
                text="Create your first template, or sync the ones already on your WhatsApp Business account."
                action={
                  canManage && (
                    <>
                      <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                        <PlusIcon className="h-4 w-4" />
                        New template
                      </button>
                      <button type="button" className="btn-secondary" onClick={onSync} disabled={syncing}>
                        Sync from Meta
                      </button>
                    </>
                  )
                }
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="card">
              <EmptyState icon={SearchIcon} tone="slate" title="Nothing matches" text="Try another filter or search." compact />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((t) => {
                const category = t.category.toUpperCase();
                return (
                  <article key={t.id} className="card card-hover flex flex-col overflow-hidden">
                    <div className="flex items-start justify-between gap-2 px-4 pt-4">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">{t.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {t.language} · updated {formatDate(t.updatedAt)}
                        </p>
                      </div>
                      <span className={`badge ${STATUS_BADGE[t.status]} shrink-0 capitalize`}>
                        {t.status === "pending" ? "In review" : t.status}
                      </span>
                    </div>
                    <button type="button" onClick={() => setPreviewing(t)} className="mx-4 mt-3 flex flex-1 flex-col justify-start text-left" title="Open preview">
                      <TemplateBubble
                        header={componentOfType(t, "HEADER")}
                        body={bodyTextOf(t)}
                        footer={componentOfType(t, "FOOTER")?.text}
                        buttons={componentOfType(t, "BUTTONS")?.buttons ?? []}
                        clamp
                      />
                    </button>
                    <div className="mt-3 flex items-center gap-1 border-t border-slate-100 px-3 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${CATEGORY_TONE[category] ?? "bg-slate-100 text-slate-600"}`}>
                        {category.charAt(0) + category.slice(1).toLowerCase()}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCreating(false);
                                setEditing(t);
                              }}
                              className="btn-ghost px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(t)}
                              disabled={deletingId === t.id}
                              className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              {deletingId === t.id ? "Deleting…" : "Delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => startCampaign(t)}
                              disabled={t.status !== "approved"}
                              title={t.status === "approved" ? "Send this template as a broadcast" : "Meta only delivers approved templates"}
                              className="btn-primary px-3 py-1.5 text-xs"
                            >
                              <MegaphoneIcon className="h-3.5 w-3.5" />
                              Broadcast
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <Drawer open={!!previewing} onClose={() => setPreviewing(null)} title={previewing?.name ?? ""} subtitle={previewing ? `${previewing.category} · ${previewing.language}` : ""} width="max-w-md">
        {previewing && <TemplatePreview template={previewing} />}
      </Drawer>

      <Drawer open={canManage && !!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name ?? ""}`} subtitle="Saving sends it back to Meta for review" width="max-w-3xl">
        {editing && (
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
      </Drawer>

      <Drawer open={canManage && creating && channels.length > 0} onClose={() => setCreating(false)} title="New template" subtitle="Submitted to Meta for approval" width="max-w-3xl">
        {creating && (
          <CreateTemplateForm
            channels={channels}
            onCancel={() => setCreating(false)}
            onCreated={(t) => {
              setTemplates((prev) => [t, ...prev]);
              setCreating(false);
              setNotice(`"${t.name}" submitted to Meta for review.`);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

/**
 * Renders the stored Meta components as the message would land on a handset.
 * Variable placeholders stay literal — there are no sample values to fill in
 * until a campaign supplies them.
 */
function TemplatePreview({ template }: { template: MessageTemplate }) {
  return (
    <div className="space-y-4">
      <TemplateBubble
        header={componentOfType(template, "HEADER")}
        body={bodyTextOf(template)}
        footer={componentOfType(template, "FOOTER")?.text}
        buttons={componentOfType(template, "BUTTONS")?.buttons ?? []}
      />
      <p className="text-xs text-slate-500">
        Placeholders like <code className="rounded bg-slate-100 px-1">{"{{1}}"}</code> are filled in when a broadcast sends the message.
      </p>
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
    <div className="grid gap-6 md:grid-cols-[1fr_17rem]">
      <form onSubmit={onSubmit} className="space-y-4">
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
        <div className="grid gap-4 sm:grid-cols-2">
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
            rows={5}
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
      <LivePreview body={bodyText} />
    </div>
  );
}

function LivePreview({ body }: { body: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Preview</p>
      <div className="rounded-[2rem] border-[6px] border-ink-900 bg-ink-900 shadow-pop">
        <div className="flex items-center gap-2 rounded-t-[1.6rem] bg-brand-700 px-3 py-2.5 text-white">
          <span className="h-7 w-7 rounded-full bg-white/20" />
          <span className="text-xs font-semibold">Your business</span>
        </div>
        <div className="min-h-[16rem] rounded-b-[1.6rem] bg-[#eef2ef]">
          <TemplateBubble body={body} buttons={[]} />
        </div>
      </div>
    </div>
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
    <div className="grid gap-6 md:grid-cols-[1fr_17rem]">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Meta treats the name and language as fixed, so only the body and category can change.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
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
            rows={5}
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
      <LivePreview body={bodyText} />
    </div>
  );
}
