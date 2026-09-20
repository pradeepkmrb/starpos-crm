"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  createPlatformTenant,
  getPlatformTenants,
  type PlatformTenant,
} from "../../../../lib/api";
import { PageSkeleton } from "../../../../components/PageSkeleton";

export default function PlatformTenantsPage() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformTenants()
      .then(setTenants)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tenants"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">All customers</h2>
      {tenants.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No customers yet.</p>
      ) : (
        <div className="card mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => {
                const owner = t.memberships[0]?.user;
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {owner ? (owner.name ?? owner.email) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{t.plan.name}</td>
                    <td className="px-4 py-3 text-slate-600">{t._count.memberships}</td>
                    <td className="px-4 py-3 text-slate-600">{t._count.channels}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateTenantForm onCreated={() => getPlatformTenants().then(setTenants)} />
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
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Add a customer</h2>
      <p className="mt-1 text-sm text-slate-500">
        Provisions a new customer account with its own owner login. Share the password with them
        directly — no email is sent.
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </label>

        <div className="sm:col-span-2">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-brand-800">{success}</p>}
          <button type="submit" disabled={submitting} className="btn-primary mt-2">
            {submitting ? "Creating…" : "Create customer"}
          </button>
        </div>
      </form>
    </section>
  );
}
