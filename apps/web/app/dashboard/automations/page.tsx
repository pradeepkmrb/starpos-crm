"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Automation,
  type Channel,
  type CreateAutomationInput,
  createAutomation,
  getAccessToken,
  listAutomations,
  listChannels,
  me,
} from "../../../lib/api";
import { AutomationCard } from "./AutomationCard";

export default function AutomationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, automationsRes, channelsRes] = await Promise.all([
          me(),
          listAutomations(),
          listChannels(),
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

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Automations</h1>
      <p className="mt-1 text-sm text-slate-500">
        Reply automatically when someone messages your WhatsApp number.
      </p>

      <div className="mt-6 space-y-4">
        {automations.length === 0 && <p className="text-sm text-slate-500">No automations yet.</p>}
        {automations.map((a) => (
          <AutomationCard
            key={a.id}
            automation={a}
            canManage={canManage}
            onRemoved={(id) => setAutomations((prev) => prev.filter((x) => x.id !== id))}
          />
        ))}
      </div>

      {canManage && (
        <CreateForm
          channels={channels}
          onCreated={(a) => setAutomations((prev) => [a, ...prev])}
        />
      )}
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
  channels: Channel[];
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

  if (channels.length === 0) {
    return (
      <p className="mt-8 text-sm text-slate-500">
        Connect a WhatsApp channel before creating an automation.
      </p>
    );
  }

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Create an automation</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
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
                  {c.displayPhoneNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Trigger</span>
            <select
              className="input"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as "keyword" | "welcome")}
            >
              <option value="keyword">Keyword in an inbound message</option>
              <option value="welcome">Welcome — first message from a new contact</option>
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
          <span className="mb-2 block text-sm font-medium text-slate-700">Steps</span>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
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
              className="btn-secondary mt-3"
              onClick={() => setSteps((prev) => [...prev, { ...EMPTY_STEP }])}
            >
              Add step
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Creating…" : "Create automation"}
        </button>
      </form>
    </section>
  );
}
