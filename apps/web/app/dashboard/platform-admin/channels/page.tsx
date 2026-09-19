"use client";

import { useEffect, useState } from "react";
import { CHANNEL_LABELS } from "@digitel/shared";
import { ApiError, getPlatformChannels, type PlatformChannel } from "../../../../lib/api";
import { PageSkeleton } from "../../../../components/PageSkeleton";

export default function PlatformChannelsPage() {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<PlatformChannel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformChannels()
      .then(setChannels)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load channels"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">All connections</h2>
      {channels.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No connections yet across any customer.</p>
      ) : (
        <div className="card mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">WABA ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Connected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channels.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.tenant.name}</td>
                  <td className="px-4 py-3 text-slate-600">{CHANNEL_LABELS[c.type]}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.displayPhoneNumber ?? c.displayName ?? c.externalId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.wabaId ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${c.status === "active" ? "badge-success" : "badge-neutral"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
