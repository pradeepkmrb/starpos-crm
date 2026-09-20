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
import { Avatar } from "../../../components/Avatar";
import { PageHeader, SectionCard } from "../../../components/ui";

const ROLE_BADGE: Record<string, string> = {
  owner: "badge-success",
  admin: "badge-info",
  agent: "badge-neutral",
  viewer: "badge-neutral",
};
import { PageSkeleton } from "../../../components/PageSkeleton";

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

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!user || !tenant || !role) return null;

  return (
    <div className="space-y-6">
      <PageHeader icon={UsersIcon} tone="sky" title="Team" subtitle={`Who has access to ${tenant.name}, and what they can do.`} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <SectionCard title="Members" subtitle={`${members.length} ${members.length === 1 ? "person" : "people"}`} bodyClassName="">
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={m.user.name ?? m.user.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {m.user.name ?? m.user.email}
                    {m.user.id === user.id && <span className="ml-1.5 text-xs font-medium text-slate-400">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">{m.user.email}</p>
                </div>
                <span className={`badge capitalize ${ROLE_BADGE[m.role] ?? "badge-neutral"}`}>{m.role}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {roleAtLeast(role, "admin") ? (
          <InviteSection invites={invites} onInvited={(inv) => setInvites((prev) => [inv, ...prev])} />
        ) : (
          <p className="card p-5 text-sm text-slate-500">Only admins and owners can invite teammates.</p>
        )}
      </div>
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
    <section className="card p-5">
      <h2 className="font-bold text-slate-900">Invite a teammate</h2>
      <p className="mt-0.5 text-sm text-slate-500">They get a link to join this workspace.</p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3">
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
            <option value="admin">Admin — manages settings and team</option>
            <option value="agent">Agent — works leads and chats</option>
            <option value="viewer">Viewer — read only</option>
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
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <p className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pending invites</p>
          {invites.map((inv) => (
            <div key={inv.id} className="px-4 py-3 text-sm">
              <p className="truncate font-semibold text-slate-700">{inv.email}</p>
              <p className="text-xs text-slate-500">
                <span className="capitalize">{inv.role}</span> · expires {new Date(inv.expiresAt).toLocaleDateString("en-IN")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
