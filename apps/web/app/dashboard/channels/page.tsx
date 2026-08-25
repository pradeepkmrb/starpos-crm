"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import { ApiError, type Channel, getAccessToken, listChannels, me } from "../../../lib/api";
import { ConnectChannelForm } from "./ConnectChannelForm";
import { ChannelCard } from "./ChannelCard";

export default function ChannelsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, channelsRes] = await Promise.all([me(), listChannels()]);
        setRole(meRes.role);
        setChannels(channelsRes);
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

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">WhatsApp Channels</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect a Meta WhatsApp Business Cloud API phone number to send and receive messages.
      </p>

      <div className="mt-6 space-y-4">
        {channels.length === 0 && (
          <p className="text-sm text-slate-500">No channels connected yet.</p>
        )}
        {channels.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} canManage={canManage} />
        ))}
      </div>

      {canManage && (
        <ConnectChannelForm
          onConnected={(channel) => setChannels((prev) => [...prev, channel])}
        />
      )}
    </div>
  );
}
