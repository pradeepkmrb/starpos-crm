"use client";

import { useState } from "react";
import { MessengerIcon } from "../../../components/icons";
import {
  ApiError,
  type ChannelConnection,
  connectMessenger,
  setConnectionEnabled,
} from "../../../lib/api";
import { Code, ConnectionCard, CopyableValue, SetupSteps, WebhookNote } from "./ConnectionCard";

/** The fields the panel subscribes the Page to on save; shown so a manual setup can match them. */
const MESSENGER_WEBHOOK_FIELDS =
  "messages, messaging_postbacks, message_reads, message_reactions, messaging_handovers";

export function MessengerCard({
  connection,
  webhookUrl,
  canManage,
  onSaved,
}: {
  connection: ChannelConnection | null;
  webhookUrl: string;
  canManage: boolean;
  onSaved: (connection: ChannelConnection) => void;
}) {
  const [pageId, setPageId] = useState(connection?.externalId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(connection?.status === "active");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onToggleEnabled(next: boolean) {
    setEnabled(next);
    setError(null);
    // Nothing is connected yet, so ticking the box only reveals intent — the
    // Save below is what creates the channel.
    if (!connection) return;
    try {
      onSaved(await setConnectionEnabled(connection.id, next));
    } catch (err) {
      setEnabled(!next);
      setError(err instanceof ApiError ? err.message : "Could not change the channel");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await connectMessenger({ pageId: pageId.trim(), accessToken: accessToken.trim(), enabled });
      onSaved(saved);
      setAccessToken("");
      setNotice(
        `Connected ${saved.displayName ?? saved.label}. Page messages now land in your Inbox.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect the Page");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConnectionCard
      icon={<MessengerIcon className="h-6 w-6 text-brand-700" />}
      iconClassName="bg-brand-50"
      title="Facebook Messenger"
      description="Page messages go straight to your Facebook Inbox"
      connection={connection}
      enabled={enabled}
      onToggleEnabled={onToggleEnabled}
      canManage={canManage}
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Facebook Page ID</span>
          <input
            required
            className="input"
            placeholder="e.g. 1234567890"
            value={pageId}
            disabled={!canManage}
            onChange={(e) => setPageId(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">Page Access Token</span>
          <input
            required={!connection}
            type="password"
            className="input"
            placeholder={connection?.hasCredentials ? "Saved — paste a new one to replace it" : "EAAB…"}
            value={accessToken}
            disabled={!canManage}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {notice && <p className="text-sm text-brand-800 sm:col-span-2">{notice}</p>}

        {canManage && (
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Connecting…" : connection ? "Save changes" : "Connect Page"}
            </button>
          </div>
        )}
      </form>

      <SetupSteps
        title="How to get these (step by step):"
        steps={[
          <>
            Go to <strong>developers.facebook.com</strong> → open your App → <strong>Add Product</strong> →{" "}
            <strong>Messenger</strong> → <strong>Set Up</strong>.
          </>,
          <>
            Open <strong>Messenger</strong> → <strong>Settings</strong> → find the{" "}
            <strong>Access Tokens</strong> section.
          </>,
          <>
            Add your Page, then click <strong>Generate Token</strong>. Copy the token that starts with{" "}
            <Code>EAAB</Code> into <strong>Page Access Token</strong> above.
          </>,
          <>
            Your <strong>Facebook Page ID</strong> is on the Page itself under{" "}
            <strong>About</strong> → <strong>Page transparency</strong>, or next to the Page in that same
            Access Tokens list.
          </>,
          <>
            Make sure the app has the <Code>pages_messaging</Code> permission, or Meta will reject every
            reply you send.
          </>,
        ]}
      />

      <WebhookNote title="Webhook for manual setup (Meta App Dashboard → Webhooks → Messenger)">
        <p>
          Only needed if you connect with your own Meta app. After you Save here, the panel subscribes your
          Page to these fields automatically — no manual &ldquo;Subscribe&rdquo; click needed.
        </p>
        <CopyableValue value={webhookUrl} />
        <CopyableValue value={MESSENGER_WEBHOOK_FIELDS} />
      </WebhookNote>
    </ConnectionCard>
  );
}
