"use client";

import { useState } from "react";
import type { Integration } from "../../../lib/api";

/** Each provider's own brand colour for the initials mark, in place of a logo. */
const ACCENTS: Record<string, string> = {
  razorpay: "bg-blue-600",
  stripe: "bg-indigo-500",
};

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never" : d.toLocaleString();
}

export function IntegrationCard({
  integration,
  canManage,
  busy,
  onConnect,
  onTest,
  onToggleActive,
  onDisconnect,
}: {
  integration: Integration;
  canManage: boolean;
  busy: boolean;
  onConnect: (credentials: Record<string, string>) => void;
  onTest: () => void;
  onToggleActive: () => void;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const { connection } = integration;
  const connected = connection !== null;

  const missingRequired = integration.fields.some((field) => {
    if (!field.required) return false;
    const typed = values[field.key]?.trim();
    if (typed) return false;
    // A stored secret counts as filled in: leaving it blank keeps it.
    return !(connected && field.secret && connection?.values[field.key]);
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onConnect(values);
    setValues({});
    setOpen(false);
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white ${
            ACCENTS[integration.provider] ?? "bg-slate-500"
          }`}
        >
          {integration.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{integration.name}</h3>
            {connection?.status === "connected" && <span className="badge badge-success">Connected</span>}
            {connection?.status === "disabled" && <span className="badge badge-neutral">Paused</span>}
            {connection?.status === "error" && <span className="badge badge-danger">Needs attention</span>}
            {connection?.mode && (
              <span className={`badge ${connection.mode === "live" ? "badge-success" : "badge-warning"}`}>
                {connection.mode === "live" ? "Live keys" : "Test keys"}
              </span>
            )}
          </div>
          <p className="text-sm capitalize text-slate-500">{integration.category}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600">{integration.description}</p>

      {connection && (
        <dl className="mt-3 space-y-1 text-sm">
          {connection.accountLabel && (
            <div className="flex gap-2">
              <dt className="text-slate-500">Account</dt>
              <dd className="truncate text-slate-800">{connection.accountLabel}</dd>
            </div>
          )}
          {integration.fields
            .filter((field) => connection.values[field.key])
            .map((field) => (
              <div key={field.key} className="flex gap-2">
                <dt className="text-slate-500">{field.label}</dt>
                <dd className="truncate font-mono text-slate-800">{connection.values[field.key]}</dd>
              </div>
            ))}
          <div className="flex gap-2">
            <dt className="text-slate-500">Last checked</dt>
            <dd className="text-slate-800">{formatDate(connection.lastCheckedAt)}</dd>
          </div>
          {connection.connectedBy && (
            <div className="flex gap-2">
              <dt className="text-slate-500">Connected by</dt>
              <dd className="truncate text-slate-800">
                {connection.connectedBy.name ?? connection.connectedBy.email}
              </dd>
            </div>
          )}
        </dl>
      )}

      {connection?.lastError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{connection.lastError}</p>
      )}

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={connected ? "btn-secondary" : "btn-primary"}
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Cancel" : connected ? "Update keys" : "Connect"}
          </button>
          {connected && (
            <>
              <button type="button" className="btn-secondary" disabled={busy} onClick={onTest}>
                Test connection
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={onToggleActive}>
                {connection?.status === "disabled" ? "Resume" : "Pause"}
              </button>
              <button type="button" className="btn-danger" disabled={busy} onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      )}

      {!canManage && !connected && (
        <p className="mt-4 text-sm text-slate-500">
          Ask an admin or owner to connect {integration.name} for this workspace.
        </p>
      )}

      {open && canManage && (
        <form className="mt-4 space-y-3 border-t border-slate-200 pt-4" onSubmit={submit}>
          {integration.fields.map((field) => (
            <div key={field.key}>
              <label className="field-label" htmlFor={`${integration.provider}-${field.key}`}>
                {field.label}
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input
                id={`${integration.provider}-${field.key}`}
                className="input"
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={
                  connected && field.secret && connection?.values[field.key]
                    ? "Leave blank to keep the stored value"
                    : field.placeholder ?? ""
                }
                value={values[field.key] ?? ""}
                disabled={busy}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
              {field.help && <p className="mt-1 text-xs text-slate-500">{field.help}</p>}
            </div>
          ))}

          <p className="text-xs text-slate-500">
            Keys are encrypted before they are stored and are never sent back to this screen. They are
            checked against {integration.name} before being saved.{" "}
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-brand-800 underline"
            >
              Where to find them
            </a>
          </p>

          <button type="submit" className="btn-primary" disabled={busy || missingRequired}>
            {busy ? "Checking…" : connected ? "Save keys" : `Connect ${integration.name}`}
          </button>
        </form>
      )}
    </div>
  );
}
