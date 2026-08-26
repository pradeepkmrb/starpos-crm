"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  type AnalyticsOverview,
  getAccessToken,
  getAnalyticsOverview,
  me,
} from "../../../lib/api";
import { DailyBarChart } from "./DailyBarChart";

const DAY_OPTIONS = [7, 14, 30, 90];

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      setLoading(true);
      try {
        await me(); // cheap auth check, also redirects on 401 below
        setData(await getAnalyticsOverview(days));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, days]);

  if (loading && !data) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return null;

  const { totals } = data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
          <p className="mt-1 text-sm text-slate-500">
            Delivery performance across all your WhatsApp channels.
          </p>
        </div>
        <select
          className="input w-auto"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Sent" value={totals.outbound.toLocaleString()} />
        <StatTile label="Delivery rate" value={formatPct(totals.deliveryRate)} tone="brand" />
        <StatTile label="Read rate" value={formatPct(totals.readRate)} tone="brand" />
        <StatTile label="Failure rate" value={formatPct(totals.failureRate)} tone={totals.failureRate > 0.1 ? "bad" : "default"} />
      </div>

      <section className="card mt-8 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Daily activity</h2>
        <div className="mt-4">
          <DailyBarChart data={data.dailySeries} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">By channel</h2>
        {data.byChannel.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No channels connected yet.</p>
        ) : (
          <div className="card mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Channel</th>
                  <th className="px-4 py-2">Sent</th>
                  <th className="px-4 py-2">Delivered</th>
                  <th className="px-4 py-2">Read</th>
                  <th className="px-4 py-2">Failed</th>
                  <th className="px-4 py-2">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byChannel.map((c) => (
                  <tr key={c.channelId}>
                    <td className="px-4 py-2 font-medium text-slate-900">{c.displayPhoneNumber}</td>
                    <td className="px-4 py-2 text-slate-700">{c.outbound.toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-700">{c.delivered.toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-700">{c.read.toLocaleString()}</td>
                    <td className={`px-4 py-2 ${c.failed > 0 ? "text-red-600" : "text-slate-700"}`}>
                      {c.failed.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{c.inbound.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bad" | "brand";
}) {
  const valueClass = tone === "bad" ? "text-red-600" : tone === "brand" ? "text-brand-800" : "text-slate-900";
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function formatPct(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}
