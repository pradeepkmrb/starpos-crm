"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_LABELS, roleAtLeast, type ChannelType, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Channel,
  type ChannelConnection,
  type PlatformPublicConfig,
  getAccessToken,
  getPlatformPublicConfig,
  listChannels,
  listConnections,
  me,
} from "../../../lib/api";
import { ConnectChannelForm } from "./ConnectChannelForm";
import { EmbeddedSignupButton } from "./EmbeddedSignupButton";
import { ChannelCard } from "./ChannelCard";
import { MessengerCard } from "./MessengerCard";
import { InstagramCard } from "./InstagramCard";
import { EmailCard } from "./EmailCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** All three Meta products deliver to the one webhook URL, because they share one app. */
const META_WEBHOOK_URL = `${API_URL}/webhooks/meta`;

export default function ChannelsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [platformConfig, setPlatformConfig] = useState<PlatformPublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, channelsRes, connectionsRes, platformConfigRes] = await Promise.all([
          me(),
          listChannels(),
          listConnections(),
          getPlatformPublicConfig(),
        ]);
        setRole(meRes.role);
        setChannels(channelsRes);
        setConnections(connectionsRes);
        setPlatformConfig(platformConfigRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load channels");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const byType = useMemo(() => {
    const map = new Map<ChannelType, ChannelConnection>();
    for (const connection of connections) map.set(connection.type, connection);
    return map;
  }, [connections]);

  /** Saving a channel returns the whole row, so it replaces its type's entry outright. */
  function upsertConnection(saved: ChannelConnection) {
    setConnections((prev) => [...prev.filter((c) => c.id !== saved.id && c.type !== saved.type), saved]);
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");
  const connectedTypes = connections.filter((c) => c.status === "active").map((c) => c.type);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Connections</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect WhatsApp, Facebook Messenger, Instagram DMs and your support mailbox. Everything you connect
        lands in one shared Inbox.
      </p>

      {connectedTypes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {connectedTypes.map((type) => (
            <span key={type} className="badge badge-success">
              {CHANNEL_LABELS[type]} connected
            </span>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">WhatsApp</h2>
        <p className="mt-1 text-sm text-slate-500">
          Connect a Meta WhatsApp Business Cloud API phone number to send and receive messages.
        </p>

        <div className="mt-4 space-y-4">
          {channels.length === 0 && (
            <p className="text-sm text-slate-500">No WhatsApp number connected yet.</p>
          )}
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} canManage={canManage} />
          ))}
        </div>

        {canManage && platformConfig?.configured && (
          <div className="card mt-4 p-6">
            <h3 className="text-base font-semibold text-slate-900">Connect a WhatsApp channel</h3>
            <p className="mt-1 text-sm text-slate-500">
              Connect your WhatsApp Business account through Meta — no credentials to copy.
            </p>
            <div className="mt-4">
              <EmbeddedSignupButton
                config={platformConfig}
                onConnected={(channel) => setChannels((prev) => [...prev, channel])}
              />
            </div>
            <div className="mt-6 border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-900">Already using the WhatsApp Business app?</p>
              <p className="mt-1 text-sm text-slate-500">
                Keep the number on your phone and use it here too. Your contacts and the last 6 months of
                chats are imported. Have the phone ready — you&apos;ll scan a QR code in the app.
              </p>
              <div className="mt-3">
                <EmbeddedSignupButton
                  businessApp
                  config={platformConfig}
                  onConnected={(channel) => setChannels((prev) => [...prev, channel])}
                />
              </div>
            </div>
          </div>
        )}

        {canManage && !platformConfig?.configured && (
          <ConnectChannelForm onConnected={(channel) => setChannels((prev) => [...prev, channel])} />
        )}
      </section>

      <div className="mt-8 space-y-6">
        <MessengerCard
          connection={byType.get("facebook") ?? null}
          webhookUrl={META_WEBHOOK_URL}
          canManage={canManage}
          onSaved={upsertConnection}
        />
        <InstagramCard
          connection={byType.get("instagram") ?? null}
          messengerConnection={byType.get("facebook") ?? null}
          webhookUrl={META_WEBHOOK_URL}
          canManage={canManage}
          onSaved={upsertConnection}
        />
        <EmailCard
          connection={byType.get("email") ?? null}
          canManage={canManage}
          onSaved={upsertConnection}
        />
      </div>

      {!canManage && (
        <p className="mt-6 text-sm text-slate-500">
          Your role can see connections but not change them.
        </p>
      )}
    </div>
  );
}
