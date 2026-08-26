"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  type AuthTenant,
  type AuthUser,
  clearTokens,
  getAccessToken,
  getAnalyticsOverview,
  listCampaigns,
  listContacts,
  listTemplates,
  me,
} from "../../lib/api";
import { BoltIcon, ChartIcon, ChatIcon, MegaphoneIcon, UsersIcon } from "../../components/icons";

interface Kpis {
  deliveryRate: number;
  readRate: number;
  contactCount: number;
  campaignCount: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, analytics, campaigns, contacts, templates] = await Promise.all([
          me(),
          getAnalyticsOverview(30),
          listCampaigns(),
          listContacts(),
          listTemplates(),
        ]);
        setUser(meRes.user);
        setTenant(meRes.tenant);
        setKpis({
          deliveryRate: analytics.totals.deliveryRate,
          readRate: analytics.totals.readRate,
          contactCount: contacts.length,
          campaignCount: campaigns.length,
        });
        void templates; // fetched for parity with other counts; no card needed yet
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!user || !tenant || !kpis) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome back{user.name ? `, ${user.name}` : ""}</h1>
      <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening at {tenant.name} (last 30 days).</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ChatIcon} label="Delivery rate" value={formatPercent(kpis.deliveryRate)} />
        <StatCard icon={ChartIcon} label="Read rate" value={formatPercent(kpis.readRate)} />
        <StatCard icon={UsersIcon} label="Audience" value={String(kpis.contactCount)} />
        <StatCard icon={MegaphoneIcon} label="Broadcasts" value={String(kpis.campaignCount)} />
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Manage who has access on the{" "}
        <a className="text-brand-800 underline" href="/dashboard/team">Workspace</a> page, or dig into message
        trends on <a className="text-brand-800 underline" href="/dashboard/analytics">Insights</a>.
      </p>
    </div>
  );
}

function StatCard({
  icon: IconComponent,
  label,
  value,
}: {
  icon: typeof BoltIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-slate-500">
        <IconComponent className="h-5 w-5" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
