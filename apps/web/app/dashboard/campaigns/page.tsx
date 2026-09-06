"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Campaign,
  type Channel,
  type ContactListSummary,
  type MessageTemplate,
  getAccessToken,
  launchCampaign,
  listCampaigns,
  listChannels,
  listContactLists,
  listTemplates,
  me,
} from "../../../lib/api";
import { CampaignCard } from "./CampaignCard";

export default function CampaignsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [lists, setLists] = useState<ContactListSummary[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Set by "Create Campaign" on a template row. Read from the URL directly
  // rather than useSearchParams, which would force a Suspense boundary around
  // this statically-prerendered page.
  const [prefill, setPrefill] = useState<{ templateName: string; languageCode: string; channelId: string } | null>(
    null,
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const templateName = params.get("template");
    if (templateName) {
      setPrefill({
        templateName,
        languageCode: params.get("language") ?? "en_US",
        channelId: params.get("channelId") ?? "",
      });
    }
    (async () => {
      try {
        const [meRes, campaignsRes, channelsRes, listsRes, templatesRes] = await Promise.all([
          me(),
          listCampaigns(),
          listChannels(),
          listContactLists(),
          listTemplates(),
        ]);
        setRole(meRes.role);
        setCampaigns(campaignsRes);
        setChannels(channelsRes.filter((c) => c.status === "active"));
        setLists(listsRes);
        setTemplates(templatesRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load campaigns");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Broadcasts</h1>
      <p className="mt-1 text-sm text-slate-500">
        Send a template message to every contact in a list.
      </p>

      <div className="mt-6 space-y-4">
        {campaigns.length === 0 && <p className="text-sm text-slate-500">No campaigns yet.</p>}
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} />
        ))}
      </div>

      {roleAtLeast(role, "admin") && (
        <LaunchForm
          channels={channels}
          lists={lists}
          templates={templates}
          prefill={prefill}
          onLaunched={(c) => setCampaigns((prev) => [c, ...prev])}
        />
      )}
    </div>
  );
}

function LaunchForm({
  channels,
  lists,
  templates,
  prefill,
  onLaunched,
}: {
  channels: Channel[];
  lists: ContactListSummary[];
  templates: MessageTemplate[];
  prefill: { templateName: string; languageCode: string; channelId: string } | null;
  onLaunched: (campaign: Campaign) => void;
}) {
  const [form, setForm] = useState({
    channelId: prefill?.channelId ?? channels[0]?.id ?? "",
    targetListId: "",
    templateName: prefill?.templateName ?? "",
    languageCode: prefill?.languageCode ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Meta only delivers approved templates, and a template belongs to the
  // channel's WABA — so the options depend on which channel is selected.
  const available = templates.filter(
    (t) => t.status === "approved" && (!form.channelId || t.channelId === form.channelId),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const campaign = await launchCampaign(form);
      onLaunched(campaign);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to launch campaign");
    } finally {
      setSubmitting(false);
    }
  }

  // Naming the missing piece matters: "connect a channel and import a list"
  // sent people to Connections when all they were missing was a list.
  if (channels.length === 0 || lists.length === 0) {
    return (
      <section className="card mt-8 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Before you can broadcast</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className={channels.length > 0 ? "text-slate-400 line-through" : "text-slate-700"}>
            Connect an active WhatsApp channel —{" "}
            <Link href="/dashboard/channels" className="text-brand-800 underline">
              Connections
            </Link>
          </li>
          <li className={lists.length > 0 ? "text-slate-400 line-through" : "text-slate-700"}>
            Put contacts into a list — select them on{" "}
            <Link href="/dashboard/contacts" className="text-brand-800 underline">
              Audience
            </Link>{" "}
            and choose &ldquo;Add to list&rdquo;, or upload a CSV. A broadcast targets a list, not
            individual contacts.
          </li>
        </ul>
      </section>
    );
  }

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Launch a campaign</h2>
      {prefill && (
        <p className="mt-1 text-sm text-slate-500">
          Prefilled from the <span className="font-medium">{prefill.templateName}</span> template — pick a
          target list to send it.
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Channel</span>
          <select
            required
            className="input"
            value={form.channelId}
            onChange={(e) => setForm({ ...form, channelId: e.target.value })}
          >
            <option value="" disabled>
              Select a channel
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayPhoneNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Target list</span>
          <select
            required
            className="input"
            value={form.targetListId}
            onChange={(e) => setForm({ ...form, targetListId: e.target.value })}
          >
            <option value="" disabled>
              Select a list
            </option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l._count.members})
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="field-label">Template</span>
          {/* Free-text here produced Meta's "(#132001) Template name does not
              exist in the translation" only after the campaign had failed for
              every recipient. Only real, approved templates are offered. */}
          <select
            required
            className="input"
            value={`${form.templateName}|${form.languageCode}`}
            onChange={(e) => {
              const [templateName, languageCode] = e.target.value.split("|");
              setForm({ ...form, templateName, languageCode });
            }}
          >
            <option value="|" disabled>
              Select a template
            </option>
            {available.map((t) => (
              <option key={t.id} value={`${t.name}|${t.language}`}>
                {t.name} ({t.language}) · {t.category}
              </option>
            ))}
          </select>
          {available.length === 0 && (
            <span className="mt-1 block text-xs text-slate-500">
              No approved templates on this channel yet — create one in the{" "}
              <Link href="/dashboard/templates" className="text-brand-800 underline">
                Message Library
              </Link>{" "}
              or use &ldquo;Sync from Meta&rdquo; there to pull in existing ones.
            </span>
          )}
        </label>

        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary sm:col-span-2">
          {submitting ? "Launching…" : "Launch campaign"}
        </button>
      </form>
    </section>
  );
}
