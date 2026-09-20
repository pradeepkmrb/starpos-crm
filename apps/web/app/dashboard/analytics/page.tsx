"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_SHORT_LABELS } from "@digitel/shared";
import {
  ApiError,
  type AnalyticsOverview,
  getAccessToken,
  getAnalyticsOverview,
  me,
} from "../../../lib/api";
import { DailyBarChart } from "./DailyBarChart";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { EmptyState, PageHeader, SectionCard, StatTile } from "../../../components/ui";
import { AlertIcon, ChartIcon, CheckIcon, EyeIcon, MegaphoneIcon } from "../../../components/icons";

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

  if (loading && !data) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return null;

  const { totals } = data;
  const funnel = [
    { label: "Sent", value: totals.outbound, color: "bg-slate-400" },
    { label: "Delivered", value: Math.round(totals.outbound * totals.deliveryRate), color: "bg-brand-400" },
    { label: "Read", value: Math.round(totals.outbound * totals.readRate), color: "bg-brand-700" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ChartIcon}
        tone="violet"
        title="Analytics"
        subtitle="How your messages perform across every connected channel."
        actions={
          <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  days === d ? "bg-brand-600 text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={MegaphoneIcon} tone="slate" label="Messages sent" value={totals.outbound.toLocaleString("en-IN")} sub={`last ${days} days`} />
        <StatTile icon={CheckIcon} label="Delivery rate" value={formatPct(totals.deliveryRate)} sub="reached the phone" />
        <StatTile icon={EyeIcon} tone="sky" label="Read rate" value={formatPct(totals.readRate)} sub="opened by the contact" />
        <StatTile
          icon={AlertIcon}
          tone={totals.failureRate > 0.1 ? "rose" : "amber"}
          label="Failure rate"
          value={formatPct(totals.failureRate)}
          sub={totals.failureRate > 0.1 ? "higher than usual" : "within normal range"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <SectionCard title="Daily activity" subtitle="Hover a bar for the day's numbers">
          <DailyBarChart data={data.dailySeries} days={days} />
        </SectionCard>
        <SectionCard title="Message funnel" subtitle="Of everything you sent">
          <div className="space-y-4">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-slate-700">{f.label}</span>
                  <span className="font-bold text-slate-900">
                    {f.value.toLocaleString("en-IN")}
                    <span className="ml-1.5 text-xs font-medium text-slate-400">
                      {totals.outbound ? `${Math.round((f.value / totals.outbound) * 100)}%` : ""}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${f.color}`} style={{ width: `${totals.outbound ? (f.value / totals.outbound) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="By channel" bodyClassName="">
        {data.byChannel.length === 0 ? (
          <EmptyState icon={ChartIcon} tone="slate" title="No channels connected yet" compact />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Channel</th>
                  <th className="px-5 py-3 font-semibold">Sent</th>
                  <th className="px-5 py-3 font-semibold">Delivered</th>
                  <th className="px-5 py-3 font-semibold">Read</th>
                  <th className="px-5 py-3 font-semibold">Failed</th>
                  <th className="px-5 py-3 font-semibold">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byChannel.map((c) => (
                  <tr key={c.channelId}>
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-900">{c.label}</span>
                      <span className="ml-2 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-800">
                        {CHANNEL_SHORT_LABELS[c.channelType]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{c.outbound.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 text-slate-700">{c.delivered.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 text-slate-700">{c.read.toLocaleString("en-IN")}</td>
                    <td className={`px-5 py-3 ${c.failed > 0 ? "font-semibold text-red-600" : "text-slate-700"}`}>{c.failed.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 text-slate-700">{c.inbound.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function formatPct(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}
