"use client";

import { useState } from "react";
import {
  ApiError,
  type Automation,
  deleteAutomation,
  setAutomationActive,
} from "../../../lib/api";

function describeStep(step: Automation["steps"][number]) {
  const base =
    step.action === "send_text"
      ? `Send text: "${step.configJson.body ?? ""}"`
      : `Send template: ${step.configJson.templateName ?? ""} (${step.configJson.languageCode ?? ""})`;
  return step.delaySeconds > 0 ? `${base} — after ${step.delaySeconds}s` : base;
}

export function AutomationCard({
  automation,
  canManage,
  onRemoved,
}: {
  automation: Automation;
  canManage: boolean;
  onRemoved: (id: string) => void;
}) {
  const [isActive, setIsActive] = useState(automation.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setBusy(true);
    setError(null);
    try {
      const updated = await setAutomationActive(automation.id, !isActive);
      setIsActive(updated.isActive);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update automation");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteAutomation(automation.id);
      onRemoved(automation.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete automation");
      setBusy(false);
    }
  }

  const trigger =
    automation.triggerType === "welcome"
      ? "On first inbound message from a new contact"
      : `On keywords: ${(automation.triggerConfigJson.keywords ?? []).join(", ")} (${
          automation.triggerConfigJson.matchType ?? "contains"
        })`;

  return (
    <div className="card px-4 py-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-slate-900">{automation.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {automation.channel.displayPhoneNumber} · {trigger}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${isActive ? "badge-success" : "badge-neutral"}`}>
            {isActive ? "active" : "paused"}
          </span>
          {canManage && (
            <>
              <button onClick={toggleActive} disabled={busy} className="btn-secondary">
                {isActive ? "Pause" : "Activate"}
              </button>
              <button onClick={remove} disabled={busy} className="btn-danger">
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <ol className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
        {automation.steps.map((step) => (
          <li key={step.id}>
            {step.order + 1}. {describeStep(step)}
          </li>
        ))}
      </ol>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
