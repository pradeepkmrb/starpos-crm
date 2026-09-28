"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@starpos-crm/shared";
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
import { PageSkeleton } from "../../../components/PageSkeleton";
import { EmptyState, PageHeader, SectionCard, SetupStep, StatTile } from "../../../components/ui";
import { CheckIcon, EyeIcon, MegaphoneIcon, UsersIcon } from "../../../components/icons";

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

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  const totals = campaigns.reduce(
    (acc, c) => {
      const s = c.recipientStats ?? {};
      // A read message was also delivered and sent; a delivered one was also sent.
      acc.sent += (s.sent ?? 0) + (s.delivered ?? 0) + (s.read ?? 0);
      acc.delivered += (s.delivered ?? 0) + (s.read ?? 0);
      acc.read += s.read ?? 0;
      return acc;
    },
    { sent: 0, delivered: 0, read: 0 },
  );
  const pct = (n: number) => (totals.sent ? `${Math.round((n / totals.sent) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MegaphoneIcon}
        title="Broadcasts"
        subtitle="Send an approved WhatsApp template to everyone in a list, then watch it get delivered and read."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={MegaphoneIcon} label="Broadcasts" value={campaigns.length} sub="all time" />
        <StatTile icon={UsersIcon} tone="sky" label="Messages sent" value={totals.sent.toLocaleString("en-IN")} sub="across all broadcasts" />
        <StatTile icon={CheckIcon} tone="violet" label="Delivered" value={pct(totals.delivered)} sub={`${totals.delivered.toLocaleString("en-IN")} messages`} />
        <StatTile icon={EyeIcon} tone="amber" label="Read" value={pct(totals.read)} sub={`${totals.read.toLocaleString("en-IN")} messages`} />
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

      <SectionCard title="History" subtitle="Newest first" bodyClassName="">
        {campaigns.length === 0 ? (
          <EmptyState
            icon={MegaphoneIcon}
            title="No broadcasts yet"
            text="Your first broadcast shows up here with live sent, delivered and read counts."
            compact
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        )}
      </SectionCard>
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
      <SectionCard title="Before you can broadcast" subtitle="Two things to set up, then you're ready to send.">
        <ol className="grid gap-3 md:grid-cols-2">
          <SetupStep n={1} done={channels.length > 0} title="Connect a WhatsApp number">
            Link your WhatsApp Business number on{" "}
            <Link href="/dashboard/channels" className="font-semibold text-brand-700 hover:underline">
              Connections
            </Link>
            .
          </SetupStep>
          <SetupStep n={2} done={lists.length > 0} title="Put contacts into a list">
            Tick contacts on{" "}
            <Link href="/dashboard/contacts" className="font-semibold text-brand-700 hover:underline">
              Audience
            </Link>{" "}
            and choose &ldquo;Add to list&rdquo;, or upload a CSV. A broadcast goes to a list, not to single contacts.
          </SetupStep>
        </ol>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="New broadcast"
      subtitle={
        prefill ? (
          <>
            Prefilled from the <span className="font-semibold">{prefill.templateName}</span> template — pick a list to send it to.
          </>
        ) : (
          "Choose the number to send from, who gets it, and which approved template to use."
        )
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
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

        <div className="sm:col-span-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            <MegaphoneIcon className="h-4 w-4" />
            {submitting ? "Sending…" : "Send broadcast"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
