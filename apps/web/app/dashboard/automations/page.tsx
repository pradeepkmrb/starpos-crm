"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { describeChannel, roleAtLeast, type TenantRole } from "@starpos-crm/shared";
import {
  ApiError,
  type Automation,
  type ChannelConnection,
  type CreateAutomationInput,
  createAutomation,
  getAccessToken,
  listAutomations,
  listConnections,
  me,
} from "../../../lib/api";
import { AutomationCard } from "./AutomationCard";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { Drawer } from "../../../components/Drawer";
import { useToast } from "../../../components/Toaster";
import { EmptyState, PageHeader, StatTile } from "../../../components/ui";
import { BoltIcon, ChatIcon, PlugIcon, PlusIcon, UsersIcon } from "../../../components/icons";
import Link from "next/link";

export default function AutomationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        // Every connected channel, not just WhatsApp — an auto-reply works the
        // same on Messenger, Instagram and email.
        const [meRes, automationsRes, channelsRes] = await Promise.all([
          me(),
          listAutomations(),
          listConnections(),
        ]);
        setRole(meRes.role);
        setAutomations(automationsRes);
        setChannels(channelsRes.filter((c) => c.status === "active"));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load automations");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");

  const live = automations.filter((a) => a.isActive).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BoltIcon}
        tone="amber"
        title="Flows"
        subtitle="Answer automatically — greet new contacts, or reply when a message mentions a keyword like “price”."
        actions={
          canManage &&
          channels.length > 0 && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <PlusIcon className="h-4 w-4" />
              New flow
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile icon={BoltIcon} tone="amber" label="Flows" value={automations.length} sub={`${live} live`} />
        <StatTile icon={ChatIcon} label="Keyword replies" value={automations.filter((a) => a.triggerType === "keyword").length} sub="answer common questions" />
        <StatTile icon={UsersIcon} tone="sky" label="Welcome messages" value={automations.filter((a) => a.triggerType === "welcome").length} sub="greet new contacts" />
      </div>

      {automations.length === 0 ? (
        <div className="card">
          {channels.length === 0 ? (
            <EmptyState
              icon={PlugIcon}
              tone="amber"
              title="Connect a channel first"
              text="Flows reply on WhatsApp, Messenger, Instagram or email — connect one to get started."
              action={
                <Link href="/dashboard/channels" className="btn-primary">
                  Go to Connections
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={BoltIcon}
              tone="amber"
              title="No flows yet"
              text="Start with a welcome message, or an instant answer whenever someone asks about price."
              action={
                canManage && (
                  <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                    <PlusIcon className="h-4 w-4" />
                    Create your first flow
                  </button>
                )
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              canManage={canManage}
              onRemoved={(id) => setAutomations((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}

      <Drawer open={canManage && creating} onClose={() => setCreating(false)} title="New flow" subtitle="Pick a trigger, then what to send" width="max-w-2xl">
        {creating && (
          <CreateForm
            channels={channels}
            onCreated={(a) => {
              setAutomations((prev) => [a, ...prev]);
              setCreating(false);
              toast(`“${a.name}” is live`);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

interface StepDraft {
  action: "send_text" | "send_template";
  value: string;
  languageCode: string;
  delaySeconds: number;
}

const EMPTY_STEP: StepDraft = { action: "send_text", value: "", languageCode: "en_US", delaySeconds: 0 };

function CreateForm({
  channels,
  onCreated,
}: {
  channels: ChannelConnection[];
  onCreated: (automation: Automation) => void;
}) {
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [triggerType, setTriggerType] = useState<"keyword" | "welcome">("keyword");
  const [keywords, setKeywords] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "exact">("contains");
  const [steps, setSteps] = useState<StepDraft[]>([{ ...EMPTY_STEP }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateAutomationInput = {
        name,
        channelId,
        triggerType,
        steps: steps.map((s) => ({
          action: s.action,
          value: s.value,
          languageCode: s.action === "send_template" ? s.languageCode : undefined,
          delaySeconds: s.delaySeconds,
        })),
        ...(triggerType === "keyword"
          ? {
              keywords: keywords
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
              matchType,
            }
          : {}),
      };
      const created = await createAutomation(input);
      onCreated(created);
      setName("");
      setKeywords("");
      setSteps([{ ...EMPTY_STEP }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create automation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {([
            ["keyword", "Keyword reply", "When a message mentions a word", ChatIcon],
            ["welcome", "Welcome message", "When a new contact writes in", UsersIcon],
          ] as const).map(([value, title, text, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTriggerType(value)}
              className={`flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                triggerType === value ? "border-brand-500 bg-brand-50/60" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className={`icon-chip h-9 w-9 ${triggerType === value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-900">{title}</span>
                <span className="block text-xs text-slate-500">{text}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Name</span>
            <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Channel</span>
            <select
              required
              className="input"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              <option value="" disabled>
                Select a channel
              </option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {describeChannel(c)}
                </option>
              ))}
            </select>
          </label>
          {triggerType === "keyword" && (
            <>
              <label className="block">
                <span className="field-label">Keywords (comma separated)</span>
                <input
                  required
                  className="input"
                  placeholder="price, pricing, cost"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Match type</span>
                <select
                  className="input"
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value as "contains" | "exact")}
                >
                  <option value="contains">Contains the keyword</option>
                  <option value="exact">Message is exactly the keyword</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div>
          <span className="field-label">Then send</span>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Action</span>
                  <select
                    className="input"
                    value={step.action}
                    onChange={(e) =>
                      updateStep(i, { action: e.target.value as "send_text" | "send_template" })
                    }
                  >
                    <option value="send_text">Send text</option>
                    <option value="send_template">Send template</option>
                  </select>
                </label>
                <label className="block flex-1">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    {step.action === "send_text" ? "Message body" : "Template name"}
                  </span>
                  <input
                    required
                    className="input"
                    value={step.value}
                    onChange={(e) => updateStep(i, { value: e.target.value })}
                  />
                </label>
                {step.action === "send_template" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Language</span>
                    <input
                      className="input"
                      value={step.languageCode}
                      onChange={(e) => updateStep(i, { languageCode: e.target.value })}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Delay (s)</span>
                  <input
                    type="number"
                    min={0}
                    max={86400}
                    className="input w-24"
                    value={step.delaySeconds}
                    onChange={(e) => updateStep(i, { delaySeconds: Number(e.target.value) })}
                  />
                </label>
                {steps.length > 1 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setSteps((prev) => prev.filter((_, x) => x !== i))}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {steps.length < 10 && (
            <button
              type="button"
              className="btn-ghost mt-2 text-brand-700"
              onClick={() => setSteps((prev) => [...prev, { ...EMPTY_STEP }])}
            >
              <PlusIcon className="h-4 w-4" />
              Add another message
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary">
          <BoltIcon className="h-4 w-4" />
          {submitting ? "Creating…" : "Create flow"}
        </button>
      </form>
    </div>
  );
}
