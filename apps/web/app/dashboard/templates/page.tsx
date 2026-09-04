"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Channel,
  type MessageTemplate,
  createTemplate,
  getAccessToken,
  listChannels,
  listTemplates,
  me,
  syncTemplates,
} from "../../../lib/api";

const STATUS_BADGE: Record<MessageTemplate["status"], string> = {
  draft: "badge-neutral",
  pending: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
};

export default function TemplatesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

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

  async function onSync() {
    setSyncNote(null);
    setError(null);
    setSyncing(true);
    try {
      const result = await syncTemplates();
      setTemplates(result.templates);
      setSyncNote(
        result.imported === 0 && result.updated === 0
          ? "Already up to date — nothing new in Meta."
          : `Imported ${result.imported} and refreshed ${result.updated} template${
              result.updated === 1 ? "" : "s"
            } from Meta.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to sync templates from Meta");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Message Library</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create WhatsApp message templates here — they&apos;re submitted to Meta for approval and this list
            updates automatically once Meta approves or rejects them.
          </p>
        </div>
        {canManage && channels.length > 0 && (
          <button type="button" onClick={onSync} disabled={syncing} className="btn-secondary shrink-0">
            {syncing ? "Syncing…" : "Sync from Meta"}
          </button>
        )}
      </div>
      {syncNote && <p className="mt-2 text-sm text-slate-600">{syncNote}</p>}

      <section className="mt-6">
        {templates.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No templates yet — create your first one below, or use{" "}
            <span className="font-medium">Sync from Meta</span> to pull in templates that already exist on
            your WhatsApp Business account.
          </p>
        ) : (
          <div className="card mt-2 divide-y divide-slate-100">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.category} · {t.language}
                  </p>
                </div>
                <span className={`badge ${STATUS_BADGE[t.status]} capitalize`}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {canManage && (
        <CreateTemplateForm
          channels={channels}
          onCreated={(t) => setTemplates((prev) => [t, ...prev])}
        />
      )}
    </div>
  );
}

function CreateTemplateForm({
  channels,
  onCreated,
}: {
  channels: Channel[];
  onCreated: (template: MessageTemplate) => void;
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [language, setLanguage] = useState("en_US");
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const template = await createTemplate({ channelId, name, category, language, bodyText });
      onCreated(template);
      setName("");
      setBodyText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create template");
    } finally {
      setSubmitting(false);
    }
  }

  if (channels.length === 0) {
    return (
      <p className="mt-8 text-sm text-slate-500">
        Connect a WhatsApp channel first — templates are submitted through a channel&apos;s WABA.
      </p>
    );
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
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="field-label">Category</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
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

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Submitting…" : "Submit to Meta"}
        </button>
      </form>
    </section>
  );
}
