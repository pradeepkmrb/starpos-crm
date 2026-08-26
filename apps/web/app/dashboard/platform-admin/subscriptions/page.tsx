"use client";

import { useEffect, useState } from "react";
import { ApiError, getPlatformTenants, type PlatformTenant } from "../../../../lib/api";

export default function PlatformSubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformTenants()
      .then(setTenants)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load subscriptions"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Billing overview</h2>
      {tenants.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No customers yet.</p>
      ) : (
        <div className="card mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Renews / ends</th>
                <th className="px-4 py-3">Auto-renew</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{t.plan.name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatPrice(t.plan.priceInPaise)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${t.subscription?.status === "active" ? "badge-success" : "badge-neutral"}`}
                    >
                      {t.subscription?.status ?? "free"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {t.subscription?.currentPeriodEnd
                      ? new Date(t.subscription.currentPeriodEnd).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.subscription ? (t.subscription.cancelAtPeriodEnd ? "No" : "Yes") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatPrice(priceInPaise: number): string {
  if (priceInPaise === 0) return "Free";
  return `₹${(priceInPaise / 100).toLocaleString("en-IN")}`;
}
