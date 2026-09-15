"use client";

import { useState } from "react";
import { MailIcon } from "../../../components/icons";
import {
  ApiError,
  type ChannelConnection,
  connectEmail,
  setConnectionEnabled,
  syncEmailChannel,
} from "../../../lib/api";
import { Code, ConnectionCard, SetupSteps } from "./ConnectionCard";

export function EmailCard({
  connection,
  canManage,
  onSaved,
}: {
  connection: ChannelConnection | null;
  canManage: boolean;
  onSaved: (connection: ChannelConnection) => void;
}) {
  const [form, setForm] = useState({
    imapHost: connection?.email?.imapHost ?? "",
    imapPort: String(connection?.email?.imapPort ?? 993),
    smtpHost: connection?.email?.smtpHost ?? "",
    smtpPort: String(connection?.email?.smtpPort ?? 587),
    emailAddress: connection?.email?.emailAddress ?? "",
    password: "",
    fromName: connection?.email?.fromName ?? "",
  });
  const [enabled, setEnabled] = useState(connection?.status === "active");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(connection?.lastSyncedAt ?? null);

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onToggleEnabled(next: boolean) {
    setEnabled(next);
    setError(null);
    if (!connection) return;
    try {
      onSaved(await setConnectionEnabled(connection.id, next));
    } catch (err) {
      setEnabled(!next);
      setError(err instanceof ApiError ? err.message : "Could not change the mailbox");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await connectEmail({
        imapHost: form.imapHost.trim(),
        imapPort: Number(form.imapPort),
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort),
        emailAddress: form.emailAddress.trim(),
        // Left out on an edit so the stored app password survives a From-name change.
        password: form.password.trim() || undefined,
        fromName: form.fromName.trim() || undefined,
        enabled,
      });
      onSaved(saved);
      setForm((prev) => ({ ...prev, password: "" }));
      setNotice("Mailbox verified and connected. New mail appears in your Inbox within a minute.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect the mailbox");
    } finally {
      setSaving(false);
    }
  }

  async function onSyncNow() {
    if (!connection) {
      setError("Connect the mailbox first.");
      return;
    }
    setError(null);
    setNotice(null);
    setSyncing(true);
    try {
      const result = await syncEmailChannel(connection.id);
      setLastSyncedAt(result.lastSyncedAt);
      setNotice(
        result.imported > 0
          ? `Imported ${result.imported} new email${result.imported === 1 ? "" : "s"}.`
          : "No new email since the last sync.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <ConnectionCard
      icon={<MailIcon className="h-6 w-6 text-amber-700" />}
      iconClassName="bg-amber-50"
      title="Email Inbox"
      description="Emails sent to your support address appear in your Inbox and replies are sent from it"
      connection={connection}
      enabled={enabled}
      onToggleEnabled={onToggleEnabled}
      canManage={canManage}
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">IMAP Host (incoming)</span>
          <input
            required
            className="input"
            placeholder="imap.gmail.com"
            value={form.imapHost}
            disabled={!canManage}
            onChange={(e) => set("imapHost", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">IMAP Port</span>
          <input
            required
            type="number"
            className="input"
            value={form.imapPort}
            disabled={!canManage}
            onChange={(e) => set("imapPort", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">SMTP Host (outgoing)</span>
          <input
            required
            className="input"
            placeholder="smtp.gmail.com"
            value={form.smtpHost}
            disabled={!canManage}
            onChange={(e) => set("smtpHost", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">SMTP Port</span>
          <input
            required
            type="number"
            className="input"
            value={form.smtpPort}
            disabled={!canManage}
            onChange={(e) => set("smtpPort", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">Email Address</span>
          <input
            required
            type="email"
            className="input"
            placeholder="support@yourbusiness.com"
            value={form.emailAddress}
            disabled={!canManage}
            onChange={(e) => set("emailAddress", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">Password / App Password</span>
          <input
            required={!connection}
            type="password"
            className="input"
            placeholder={connection?.hasCredentials ? "Saved — leave blank to keep it" : ""}
            value={form.password}
            disabled={!canManage}
            onChange={(e) => set("password", e.target.value)}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="field-label">From Name (optional)</span>
          <input
            className="input"
            placeholder="Your Business Support"
            value={form.fromName}
            disabled={!canManage}
            onChange={(e) => set("fromName", e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {notice && <p className="text-sm text-brand-800 sm:col-span-2">{notice}</p>}

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          {canManage && (
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Verifying…" : connection ? "Save changes" : "Connect mailbox"}
            </button>
          )}
          {canManage && (
            <button type="button" onClick={onSyncNow} disabled={syncing || !connection} className="btn-secondary">
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
          <span className="text-sm text-slate-500">
            {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : "Not synced yet"}
          </span>
        </div>
      </form>

      <SetupSteps
        title="How to connect Gmail (step by step):"
        steps={[
          <>
            In your Google Account → <strong>Security</strong>, turn on <strong>2-Step Verification</strong>.
          </>,
          <>
            Go to <strong>Google Account</strong> → <strong>Security</strong> →{" "}
            <strong>App passwords</strong> and create a new app password. You get a 16-character password.
          </>,
          <>
            Fill the fields above — IMAP: <Code>imap.gmail.com</Code> port <strong>993</strong>; SMTP:{" "}
            <Code>smtp.gmail.com</Code> port <strong>587</strong>. Use the app password, not your normal
            one.
          </>,
          <>
            For Outlook or Microsoft 365, use <Code>outlook.office365.com</Code> port <strong>993</strong>{" "}
            and <Code>smtp.office365.com</Code> port <strong>587</strong>.
          </>,
          <>
            Tick <strong>Enable</strong> and Save. Mail is checked about once a minute;{" "}
            <strong>Sync now</strong> checks immediately.
          </>,
        ]}
      />
    </ConnectionCard>
  );
}
