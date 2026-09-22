"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  createPlatformTenant,
  getPlatformPlans,
  getPlatformTenants,
  setPlatformTenantPlan,
  type PlatformPlan,
  type PlatformTenant,
} from "../../../../lib/api";
import { PageSkeleton } from "../../../../components/PageSkeleton";
import { Avatar } from "../../../../components/Avatar";
import { Drawer } from "../../../../components/Drawer";
import { useToast } from "../../../../components/Toaster";
import { EmptyState, SectionCard } from "../../../../components/ui";
import { AlertIcon, PlusIcon, UsersIcon } from "../../../../components/icons";

function planPrice(paise: number): string {
  return paise === 0 ? "Free" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}/mo`;
}

export default function PlatformTenantsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Promise.all([getPlatformTenants(), getPlatformPlans()])
      .then(([tenantsRes, plansRes]) => {
        setTenants(tenantsRes);
        setPlans(plansRes);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load customers"))
      .finally(() => setLoading(false));
  }, []);

  async function changePlan(tenant: PlatformTenant, planCode: string) {
    if (planCode === tenant.plan.code) return;
    const target = plans.find((p) => p.code === planCode);
    // Moving down can leave them holding more than the plan allows, which
    // blocks new records for them — worth a deliberate second step.
    if (target && target.priceInPaise < tenant.plan.priceInPaise) {
      const confirmed = window.confirm(
        `Move ${tenant.name} down to ${target.name}? Nothing is deleted, but if they are over that plan's limits they can't create anything new until they are back under.`,
      );
      if (!confirmed) return;
    }
    setSavingId(tenant.id);
    try {
      const updated = await setPlatformTenantPlan(tenant.id, planCode);
      setTenants((all) => all.map((t) => (t.id === updated.id ? updated : t)));
      toast(
        updated.overLimit
          ? `${updated.name} moved to ${updated.plan.name} — they are over that plan's limits`
          : `${updated.name} is now on ${updated.plan.name}`,
        updated.overLimit ? "error" : "success",
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change the plan", "error");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <PageSkeleton />;
  if (error) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Customers"
        subtitle={`${tenants.length} ${tenants.length === 1 ? "account" : "accounts"} · change a plan to lift their limits straight away`}
        bodyClassName=""
        actions={
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <PlusIcon className="h-4 w-4" />
            Add customer
          </button>
        }
      >
        {tenants.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No customers yet"
            text="Provision an account and share its owner login."
            action={
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                <PlusIcon className="h-4 w-4" />
                Add customer
              </button>
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Owner</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Members</th>
                  <th className="px-5 py-3 font-semibold">Channels</th>
                  <th className="px-5 py-3 font-semibold">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => {
                  const owner = t.memberships[0]?.user;
                  const limits = plans.find((p) => p.code === t.plan.code);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={t.name} size="h-9 w-9 text-xs" />
                          <div>
                            <p className="font-semibold text-slate-900">{t.name}</p>
                            {t.overLimit && (
                              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                                <AlertIcon className="h-3.5 w-3.5" />
                                Over plan limits
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{owner ? (owner.name ?? owner.email) : "—"}</td>
                      <td className="px-5 py-3">
                        <select
                          className="input w-44 py-1.5"
                          aria-label={`Plan for ${t.name}`}
                          value={t.plan.code}
                          disabled={savingId === t.id}
                          onChange={(e) => void changePlan(t, e.target.value)}
                        >
                          {plans.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name} · {planPrice(p.priceInPaise)}
                            </option>
                          ))}
                        </select>
                        {t.subscription && (
                          <p className="mt-1 text-xs text-slate-400">Razorpay: {t.subscription.status}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {t._count.memberships}
                        {limits && <span className="text-slate-400"> / {limits.maxTeamSeats === -1 ? "∞" : limits.maxTeamSeats}</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {t._count.channels}
                        {limits && <span className="text-slate-400"> / {limits.maxChannels === -1 ? "∞" : limits.maxChannels}</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                        {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Drawer
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a customer"
        subtitle="Creates the account and its owner login"
      >
        {adding && (
          <CreateTenantForm
            onCreated={() => {
              getPlatformTenants().then(setTenants).catch(() => undefined);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function CreateTenantForm({ onCreated }: { onCreated: () => void }) {
  const [tenantName, setTenantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await createPlatformTenant({ tenantName, ownerName, ownerEmail, ownerPassword });
      setSuccess(
        `Customer created. Share these login details with ${ownerEmail} — they are not emailed automatically.`,
      );
      setTenantName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <p className="text-sm text-slate-500">
        The new account starts on the free plan — change it in the table once they have paid.
      </p>
      <label className="block">
        <span className="field-label">Business name</span>
        <input required className="input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
      </label>
      <label className="block">
        <span className="field-label">Owner name</span>
        <input required className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
      </label>
      <label className="block">
        <span className="field-label">Owner email</span>
        <input
          required
          type="email"
          className="input"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="field-label">Initial password</span>
        <input
          required
          minLength={8}
          type="text"
          className="input"
          value={ownerPassword}
          onChange={(e) => setOwnerPassword(e.target.value)}
        />
        <span className="mt-1 block text-xs text-slate-500">
          Share it with them directly — no email is sent.
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">{success}</p>}
      <button type="submit" disabled={submitting} className="btn-primary justify-self-start">
        {submitting ? "Creating…" : "Create customer"}
      </button>
    </form>
  );
}
