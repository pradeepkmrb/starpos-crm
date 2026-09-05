"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Campaign,
  type Channel,
  type ContactListSummary,
  getAccessToken,
  launchCampaign,
  listCampaigns,
  listChannels,
  listContactLists,
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
        const [meRes, campaignsRes, channelsRes, listsRes] = await Promise.all([
          me(),
          listCampaigns(),
          listChannels(),
          listContactLists(),
        ]);
        setRole(meRes.role);
        setCampaigns(campaignsRes);
        setChannels(channelsRes.filter((c) => c.status === "active"));
        setLists(listsRes);
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
  prefill,
  onLaunched,
}: {
  channels: Channel[];
  lists: ContactListSummary[];
  prefill: { templateName: string; languageCode: string; channelId: string } | null;
  onLaunched: (campaign: Campaign) => void;
}) {
  const [form, setForm] = useState({
    channelId: prefill?.channelId ?? "",
    targetListId: "",
    templateName: prefill?.templateName ?? "hello_world",
    languageCode: prefill?.languageCode ?? "en_US",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  if (channels.length === 0 || lists.length === 0) {
    return (
      <p className="mt-8 text-sm text-slate-500">
        Connect a WhatsApp channel and import a contact list before launching a campaign.
      </p>
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
        <label className="block">
          <span className="field-label">Template name</span>
          <input
            required
            className="input"
            value={form.templateName}
            onChange={(e) => setForm({ ...form, templateName: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="field-label">Language</span>
          <input
            required
            className="input"
            value={form.languageCode}
            onChange={(e) => setForm({ ...form, languageCode: e.target.value })}
          />
        </label>

        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary sm:col-span-2">
          {submitting ? "Launching…" : "Launch campaign"}
        </button>
      </form>
    </section>
  );
}
