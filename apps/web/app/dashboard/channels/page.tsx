"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_LABELS, roleAtLeast, type ChannelType, type TenantRole } from "@starpos-crm/shared";
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
import { PageSkeleton } from "../../../components/PageSkeleton";
import { PageHeader } from "../../../components/ui";
import { CameraIcon, ChatIcon, MailIcon, MessengerIcon, PlugIcon } from "../../../components/icons";

const CHANNEL_TILES: { type: ChannelType; title: string; blurb: string; icon: typeof ChatIcon; tint: string }[] = [
  { type: "whatsapp", title: "WhatsApp", blurb: "Broadcasts, chats and flows", icon: ChatIcon, tint: "bg-brand-50 text-brand-600" },
  { type: "facebook", title: "Messenger", blurb: "Your Facebook Page inbox", icon: MessengerIcon, tint: "bg-sky-50 text-sky-600" },
  { type: "instagram", title: "Instagram", blurb: "Direct messages", icon: CameraIcon, tint: "bg-rose-50 text-rose-600" },
  { type: "email", title: "Email", blurb: "Your support mailbox", icon: MailIcon, tint: "bg-amber-50 text-amber-600" },
];

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
  const [tab, setTab] = useState<ChannelType>("whatsapp");

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

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");
  const connectedTypes = connections.filter((c) => c.status === "active").map((c) => c.type);

  const isConnected = (type: ChannelType) =>
    type === "whatsapp" ? channels.some((c) => c.status === "active") : connectedTypes.includes(type);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PlugIcon}
        title="Connections"
        subtitle="Connect WhatsApp, Messenger, Instagram and your support mailbox — everything lands in one shared Inbox."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CHANNEL_TILES.map((t) => {
          const on = isConnected(t.type);
          const active = tab === t.type;
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => setTab(t.type)}
              aria-pressed={active}
              className={`card card-hover flex flex-col items-start p-5 text-left ring-2 transition-all ${active ? "ring-brand-500" : "ring-transparent"}`}
            >
              <div className="flex w-full items-start justify-between">
                <span className={`icon-chip h-11 w-11 rounded-2xl ${t.tint}`}>
                  <t.icon className="h-5 w-5" />
                </span>
                <span className={`badge ${on ? "badge-success" : "badge-neutral"}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                  {on ? "Connected" : "Not connected"}
                </span>
              </div>
              <p className="mt-4 font-bold text-slate-900">{t.title}</p>
              <p className="text-sm text-slate-500">{t.blurb}</p>
            </button>
          );
        })}
      </div>

      {tab === "whatsapp" && (
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{CHANNEL_LABELS.whatsapp}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            A WhatsApp Business Cloud API number to send and receive messages.
          </p>
        </div>

        <div className="space-y-4">
          {channels.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
              No WhatsApp number connected yet.
            </p>
          )}
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} canManage={canManage} />
          ))}
        </div>

        {canManage && platformConfig?.configured && (
          <div className="card p-6">
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

        {/* Embedded Signup isn't mandatory for now: manual credentials always work too. */}
        {canManage && (
          <ConnectChannelForm
            title={platformConfig?.configured ? "Or connect manually" : undefined}
            onConnected={(channel) => setChannels((prev) => [...prev, channel])}
          />
        )}
      </section>
      )}

      {tab === "facebook" && (
        <MessengerCard
          connection={byType.get("facebook") ?? null}
          webhookUrl={META_WEBHOOK_URL}
          canManage={canManage}
          onSaved={upsertConnection}
        />
      )}
      {tab === "instagram" && (
        <InstagramCard
          connection={byType.get("instagram") ?? null}
          messengerConnection={byType.get("facebook") ?? null}
          webhookUrl={META_WEBHOOK_URL}
          canManage={canManage}
          onSaved={upsertConnection}
        />
      )}
      {tab === "email" && (
        <EmailCard
          connection={byType.get("email") ?? null}
          canManage={canManage}
          onSaved={upsertConnection}
        />
      )}

      {!canManage && (
        <p className="text-sm text-slate-500">
          Your role can see connections but not change them.
        </p>
      )}
    </div>
  );
}
