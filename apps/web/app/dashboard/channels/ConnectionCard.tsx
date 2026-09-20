"use client";

import type { ReactNode } from "react";
import type { ChannelConnection } from "../../../lib/api";

/**
 * Shared shell for the three credential-based channels. Each card holds its own
 * form state; this only owns the chrome — icon, title, Enable switch, status —
 * so the three stay visually identical without repeating the markup.
 */
export function ConnectionCard({
  icon,
  iconClassName,
  title,
  description,
  connection,
  enabled,
  onToggleEnabled,
  canManage,
  children,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
  connection: ChannelConnection | null;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  canManage: boolean;
  children: ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>
            {icon}
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="mt-0.5 max-w-md text-sm text-slate-500">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {connection && (
            <span className={`badge ${connection.status === "active" ? "badge-success" : "badge-neutral"}`}>
              {connection.status === "active" ? "Connected" : "Disabled"}
            </span>
          )}
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-brand-800 focus:ring-brand-500"
              checked={enabled}
              disabled={!canManage}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            Enable
          </label>
        </div>
      </div>

      {connection?.lastError && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {connection.lastError}
        </p>
      )}

      <div className="mt-5">{children}</div>
    </section>
  );
}

/** The grey "How to get these" panel every card ends with. */
export function SetupSteps({ title, steps }: { title: string; steps: ReactNode[] }) {
  return (
    <details className="group mt-5 rounded-2xl border border-slate-200 bg-slate-50/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-800">
        {title.replace(/:$/, "")}
        <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ol className="space-y-2 px-4 pb-4 text-sm text-slate-600">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Blue panel for the webhook details an operator only needs with their own Meta app. */
export function WebhookNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group mt-3 rounded-2xl border border-brand-100 bg-brand-50/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-brand-900">
        {title}
        <span className="text-brand-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm text-slate-600">{children}</div>
    </details>
  );
}

/** Monospaced value with a copy button — used for webhook URLs and field lists. */
export function CopyableValue({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-slate-700">{value}</code>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(value)}
        className="shrink-0 rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        Copy
      </button>
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-white px-1 py-0.5 font-mono text-xs text-slate-700">{children}</code>
  );
}
