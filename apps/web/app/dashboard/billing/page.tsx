"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UNLIMITED, formatPaiseAsInr, roleAtLeast, type PlanCode, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type BillingOverview,
  getAccessToken,
  getBillingOverview,
  me,
  startCheckout,
} from "../../../lib/api";

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, overview] = await Promise.all([me(), getBillingOverview()]);
        setRole(meRes.role);
        setData(overview);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load billing");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data || !role) return null;

  const meters = [
    { label: "Contacts", used: data.usage.contacts, limit: data.limits.maxContacts },
    { label: "WhatsApp channels", used: data.usage.channels, limit: data.limits.maxChannels },
    { label: "Automations", used: data.usage.automations, limit: data.limits.maxAutomations },
    { label: "Team members", used: data.usage.teamSeats, limit: data.limits.maxTeamSeats },
    {
      label: "API requests this month",
      used: data.usage.apiRequests,
      limit: data.limits.maxApiRequestsPerMonth,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Plan &amp; Usage</h1>
      <p className="mt-1 text-sm text-slate-500">
        You are on the <span className="font-medium text-slate-900">{data.currentPlan.name}</span> plan
        {data.subscription?.currentPeriodEnd &&
          ` · renews ${new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}`}
        {data.subscription?.cancelAtPeriodEnd && " · cancels at period end"}
      </p>

      {data.overLimit && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are over your current plan&apos;s limits. Nothing has been deleted, but you can&apos;t
          create new records until you upgrade or reduce usage.
        </p>
      )}

      <section className="card mt-8 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Usage</h2>
        <div className="mt-4 space-y-4">
          {meters.map((m) => (
            <UsageMeter key={m.label} {...m} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Plans</h2>
        {!data.billingConfigured && (
          <p className="mt-2 text-sm text-slate-500">
            Razorpay keys are not configured on the server, so checkout is unavailable.
          </p>
        )}
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {data.availablePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={plan.id === data.currentPlan.id}
              isOwner={roleAtLeast(role, "owner")}
              billingConfigured={data.billingConfigured}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === UNLIMITED;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const atLimit = !unlimited && used >= limit;

  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className={atLimit ? "font-medium text-red-600" : "text-slate-500"}>
          {used.toLocaleString()} / {unlimited ? "unlimited" : limit.toLocaleString()}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${atLimit ? "bg-red-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  isOwner,
  billingConfigured,
}: {
  plan: BillingOverview["availablePlans"][number];
  isCurrent: boolean;
  isOwner: boolean;
  billingConfigured: boolean;
}) {
  const canCheckout = isOwner && billingConfigured;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await startCheckout(plan.code as PlanCode);
      if (res.checkoutPayload.short_url) {
        // Razorpay-hosted checkout — card details never touch this app.
        window.location.href = res.checkoutPayload.short_url;
      } else {
        setError("Checkout started but Razorpay returned no payment link.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-card ${
        isCurrent ? "border-brand-700 ring-1 ring-brand-700" : "border-slate-200"
      }`}
    >
      <h3 className="font-semibold text-slate-900">{plan.name}</h3>
      <p className="mt-1 text-2xl font-bold text-slate-900">
        {formatPaiseAsInr(plan.priceInPaise)}
        <span className="text-sm font-normal text-slate-500">/mo</span>
      </p>
      <ul className="mt-3 space-y-1 text-sm text-slate-600">
        <li>{plan.maxContacts === UNLIMITED ? "Unlimited" : plan.maxContacts.toLocaleString()} contacts</li>
        <li>{plan.maxChannels === UNLIMITED ? "Unlimited" : plan.maxChannels} channel(s)</li>
        <li>{plan.maxAutomations === UNLIMITED ? "Unlimited" : plan.maxAutomations} automation(s)</li>
        <li>{plan.maxTeamSeats === UNLIMITED ? "Unlimited" : plan.maxTeamSeats} team seat(s)</li>
      </ul>

      {isCurrent ? (
        <p className="mt-4 text-sm font-medium text-brand-800">Current plan</p>
      ) : plan.priceInPaise === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Downgrade happens automatically if you cancel.</p>
      ) : canCheckout ? (
        <button onClick={upgrade} disabled={busy} className="btn-primary mt-4 w-full">
          {busy ? "Starting…" : "Upgrade"}
        </button>
      ) : !isOwner ? (
        <p className="mt-4 text-xs text-slate-500">Only the workspace owner can change the plan.</p>
      ) : (
        <p className="mt-4 text-xs text-slate-500">Billing isn&apos;t configured on this server yet.</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
