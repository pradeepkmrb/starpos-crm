"use client";

import { useState } from "react";
import { CameraIcon } from "../../../components/icons";
import {
  ApiError,
  type ChannelConnection,
  connectInstagram,
  setConnectionEnabled,
} from "../../../lib/api";
import { Code, ConnectionCard, CopyableValue, SetupSteps, WebhookNote } from "./ConnectionCard";

const INSTAGRAM_WEBHOOK_FIELDS = "messages, messaging_postbacks, message_reactions, messaging_seen";

export function InstagramCard({
  connection,
  messengerConnection,
  webhookUrl,
  canManage,
  onSaved,
}: {
  connection: ChannelConnection | null;
  /** Instagram reuses the Page token, so the Messenger card's state decides what we ask for. */
  messengerConnection: ChannelConnection | null;
  webhookUrl: string;
  canManage: boolean;
  onSaved: (connection: ChannelConnection) => void;
}) {
  const [instagramAccountId, setInstagramAccountId] = useState(connection?.externalId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(connection?.status === "active");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasPageToken = Boolean(messengerConnection?.hasCredentials || connection?.hasCredentials);

  async function onToggleEnabled(next: boolean) {
    setEnabled(next);
    setError(null);
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
      const saved = await connectInstagram({
        instagramAccountId: instagramAccountId.trim(),
        accessToken: accessToken.trim() || undefined,
        pageId: messengerConnection?.externalId ?? undefined,
        enabled,
      });
      onSaved(saved);
      setAccessToken("");
      setNotice(`Connected ${saved.displayName ?? saved.label}. Instagram DMs now land in your Inbox.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect the Instagram account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConnectionCard
      icon={<CameraIcon className="h-6 w-6 text-slate-700" />}
      iconClassName="bg-slate-100"
      title="Instagram DM"
      description="Instagram direct messages in your Inbox (uses the same Page token)"
      connection={connection}
      enabled={enabled}
      onToggleEnabled={onToggleEnabled}
      canManage={canManage}
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Instagram Account ID</span>
          <input
            required
            className="input"
            placeholder="e.g. 17841400000000000"
            value={instagramAccountId}
            disabled={!canManage}
            onChange={(e) => setInstagramAccountId(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">
            Page Access Token {hasPageToken && <span className="font-normal text-slate-400">(optional)</span>}
          </span>
          <input
            required={!hasPageToken}
            type="password"
            className="input"
            placeholder={
              hasPageToken ? "Reusing the token from Facebook Messenger" : "EAAB… (same token as the Page)"
            }
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
              {saving ? "Connecting…" : connection ? "Save changes" : "Connect Instagram"}
            </button>
          </div>
        )}
      </form>

      <SetupSteps
        title="How to get the Instagram Account ID (step by step):"
        steps={[
          <>
            In the Instagram app: <strong>Settings</strong> → <strong>Account</strong> →{" "}
            <strong>Switch to Professional (Business)</strong> account.
          </>,
          <>
            Link that Instagram account to your Facebook Page (<strong>Page Settings</strong> →{" "}
            <strong>Linked accounts</strong> → <strong>Instagram</strong>).
          </>,
          <>
            Open <strong>developers.facebook.com/tools/explorer</strong> (Graph API Explorer) and run:{" "}
            <Code>GET /&#123;page-id&#125;?fields=instagram_business_account</Code>
          </>,
          <>
            Copy the returned <Code>id</Code> (starts with <strong>17841…</strong>) into{" "}
            <strong>Instagram Account ID</strong> above.
          </>,
          <>
            No separate token needed — the Page Access Token above is reused. Just make sure the{" "}
            <Code>instagram_manage_messages</Code> permission is enabled.
          </>,
        ]}
      />

      <WebhookNote title="Webhook for manual setup (Meta App Dashboard → Webhooks → Instagram)">
        <p>
          Only needed if you connect with your own Meta app. After you Save here, the panel subscribes your
          Page to these fields automatically — no manual &ldquo;Subscribe&rdquo; click needed.
        </p>
        <CopyableValue value={webhookUrl} />
        <CopyableValue value={INSTAGRAM_WEBHOOK_FIELDS} />
      </WebhookNote>
    </ConnectionCard>
  );
}
