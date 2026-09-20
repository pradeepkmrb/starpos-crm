"use client";

import { useState } from "react";
import { describeChannel } from "@digitel/shared";
import {
  ApiError,
  type Automation,
  deleteAutomation,
  setAutomationActive,
} from "../../../lib/api";
import { BoltIcon, ChatIcon, ClockIcon, DocumentIcon, UsersIcon } from "../../../components/icons";

function delayLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

/** An on/off switch; the knob slides, the track turns green when on. */
export function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
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
    if (!window.confirm(`Delete the flow “${automation.name}”?`)) return;
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

  const keywords = automation.triggerConfigJson.keywords ?? [];

  return (
    <article className={`card overflow-hidden transition-opacity ${isActive ? "" : "opacity-75"}`}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className={`icon-chip ${isActive ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>
          <BoltIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-900">{automation.name}</p>
          <p className="truncate text-xs text-slate-500">{describeChannel(automation.channel)}</p>
        </div>
        <span className={`badge ${isActive ? "badge-success" : "badge-neutral"}`}>{isActive ? "Live" : "Paused"}</span>
        {canManage && (
          <>
            <Switch on={isActive} disabled={busy} onChange={toggleActive} label={isActive ? "Pause flow" : "Turn flow on"} />
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
          </>
        )}
      </div>

      <ol className="flex flex-wrap items-stretch gap-2 bg-slate-50/60 px-5 py-4">
        <li className="flex min-w-[12rem] flex-1 items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <span className="icon-chip h-8 w-8 bg-amber-100 text-amber-600">
            {automation.triggerType === "welcome" ? <UsersIcon className="h-4 w-4" /> : <ChatIcon className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">When</p>
            {automation.triggerType === "welcome" ? (
              <p className="text-sm text-slate-800">A new contact messages you for the first time</p>
            ) : (
              <>
                <p className="text-sm text-slate-800">
                  A message {automation.triggerConfigJson.matchType === "exact" ? "is exactly" : "contains"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {keywords.map((k) => (
                    <span key={k} className="rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      {k}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </li>
        {automation.steps.map((step) => (
          <li key={step.id} className="flex min-w-[12rem] flex-1 items-stretch gap-2">
            <span className="flex items-center text-slate-300" aria-hidden>
              →
            </span>
            <div className="flex flex-1 items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
              <span className="icon-chip h-8 w-8 bg-brand-50 text-brand-600">
                {step.action === "send_text" ? <ChatIcon className="h-4 w-4" /> : <DocumentIcon className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                  {step.action === "send_text" ? "Reply" : "Send template"}
                  {step.delaySeconds > 0 && (
                    <span className="inline-flex items-center gap-0.5 font-semibold normal-case tracking-normal text-slate-400">
                      <ClockIcon className="h-3 w-3" /> after {delayLabel(step.delaySeconds)}
                    </span>
                  )}
                </p>
                <p className="line-clamp-3 text-sm text-slate-800">
                  {step.action === "send_text"
                    ? step.configJson.body ?? ""
                    : `${step.configJson.templateName ?? ""} (${step.configJson.languageCode ?? ""})`}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {error && <p className="px-5 pb-3 text-sm text-red-600">{error}</p>}
    </article>
  );
}
