"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  type AuthTenant,
  type AuthUser,
  type Invite,
  type Member,
  clearTokens,
  createInvite,
  getAccessToken,
  listInvites,
  listMembers,
  me,
} from "../../../lib/api";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import { UsersIcon } from "../../../components/icons";

export default function TeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, membersRes] = await Promise.all([me(), listMembers()]);
        setUser(meRes.user);
        setTenant(meRes.tenant);
        setRole(meRes.role);
        setMembers(membersRes);
        if (roleAtLeast(meRes.role, "admin")) {
          setInvites(await listInvites());
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load team");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!user || !tenant || !role) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Workspace</h1>
      <p className="mt-1 text-sm text-slate-500">Manage who has access to {tenant.name}.</p>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Members</h2>
        </div>
        <div className="card mt-3 divide-y divide-slate-100">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-slate-700">
                {m.user.name ?? m.user.email} <span className="text-slate-400">({m.user.email})</span>
              </span>
              <span className="badge badge-neutral capitalize">{m.role}</span>
            </div>
          ))}
        </div>
      </section>

      {roleAtLeast(role, "admin") ? (
        <InviteSection invites={invites} onInvited={(inv) => setInvites((prev) => [inv, ...prev])} />
      ) : (
        <p className="mt-8 text-sm text-slate-500">Only admins and owners can invite teammates.</p>
      )}
    </div>
  );
}

function InviteSection({
  invites,
  onInvited,
}: {
  invites: Invite[];
  onInvited: (invite: Invite) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("agent");
  const [error, setError] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAcceptUrl(null);
    setSubmitting(true);
    try {
      const invite = await createInvite({ email, role });
      onInvited(invite);
      setAcceptUrl(invite.acceptUrl);
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Invite a teammate</h2>
      <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Email</span>
          <input
            required
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">Role</span>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as TenantRole)}
          >
            <option value="admin">admin</option>
            <option value="agent">agent</option>
            <option value="viewer">viewer</option>
          </select>
        </label>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Sending…" : "Send invite"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {acceptUrl && (
        <p className="mt-2 text-sm text-brand-800">
          Invite created. No email provider is wired up yet — share this link manually:{" "}
          <code className="rounded bg-slate-100 px-1">{acceptUrl}</code>
        </p>
      )}

      {invites.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-slate-700">{inv.email}</span>
              <span className="text-slate-500">
                {inv.role} · pending, expires {new Date(inv.expiresAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
