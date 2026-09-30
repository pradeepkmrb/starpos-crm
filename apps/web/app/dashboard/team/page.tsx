"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACCESS_LEVEL_LABELS,
  ACCESS_LEVELS,
  ACCESS_MODULES,
  DATA_SCOPE_LABELS,
  DEFAULT_ROLE_TEMPLATES,
  type AccessLevel,
  type DataScope,
  type Permissions,
} from "@starpos-crm/shared";
import {
  ApiError,
  type AuthTenant,
  type AuthUser,
  type Invite,
  type Member,
  type TeamAttendance,
  type WorkspaceRole,
  type WorkspaceRoleInput,
  clearTokens,
  createInvite,
  createRole,
  deleteRole,
  getAccessToken,
  getTeamAttendance,
  listInvites,
  listMembers,
  listRoles,
  me,
  removeMember,
  revokeInvite,
  setMemberRole,
  updateRole,
} from "../../../lib/api";
import { UsersIcon } from "../../../components/icons";
import { Avatar } from "../../../components/Avatar";
import { PageHeader, SectionCard } from "../../../components/ui";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useToast } from "../../../components/Toaster";
import { useAccess } from "../../../components/AccessContext";

export default function TeamPage() {
  const router = useRouter();
  const toast = useToast();
  const access = useAccess();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkspaceRole | "new" | null>(null);
  const canManage = access.canEdit("team");

  const reload = useCallback(async () => {
    const [membersRes, invitesRes, rolesRes] = await Promise.all([listMembers(), listInvites(), listRoles()]);
    setMembers(membersRes);
    setInvites(invitesRes);
    setRoles(rolesRes);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const meRes = await me();
        setUser(meRes.user);
        setTenant(meRes.tenant);
        await reload();
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
  }, [router, reload]);

  async function onChangeRole(member: Member, roleId: string) {
    try {
      await setMemberRole(member.user.id, roleId);
      await reload();
      toast(`${member.user.name ?? member.user.email} is now ${roles.find((r) => r.id === roleId)?.name ?? "updated"}.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change the role");
    }
  }

  async function onRemove(member: Member) {
    const name = member.user.name ?? member.user.email;
    if (!window.confirm(`Remove ${name} from ${tenant?.name ?? "this workspace"}? Their leads and history stay.`)) return;
    try {
      await removeMember(member.user.id);
      await reload();
      toast(`Removed ${name}.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove them");
    }
  }

  async function onDeleteRole(role: WorkspaceRole) {
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    try {
      await deleteRole(role.id);
      await reload();
      toast(`Deleted "${role.name}".`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete the role");
    }
  }

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!user || !tenant) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UsersIcon}
        tone="sky"
        title="Team and roles"
        subtitle={`Who has access to ${tenant.name}, and which menus each role can use.`}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <SectionCard title="Members" subtitle={`${members.length} ${members.length === 1 ? "person" : "people"}`} bodyClassName="">
          <ul className="divide-y divide-slate-100">
            {members.map((m) => {
              const isOwner = m.role === "owner";
              const isMe = m.user.id === user.id;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <Avatar name={m.user.name ?? m.user.email} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {m.user.name ?? m.user.email}
                      {isMe && <span className="ml-1.5 text-xs font-medium text-slate-400">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-slate-500">{m.user.email}</p>
                  </div>
                  {isOwner ? (
                    <span className="badge badge-success">Owner</span>
                  ) : canManage && !isMe ? (
                    <div className="flex items-center gap-2">
                      <select
                        className="input w-44 py-1.5"
                        value={m.roleId ?? ""}
                        onChange={(e) => void onChangeRole(m, e.target.value)}
                        aria-label={`Role for ${m.user.name ?? m.user.email}`}
                      >
                        {!m.roleId && <option value="">No role</option>}
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void onRemove(m)} className="btn-ghost px-2 text-red-600 hover:bg-red-50">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="badge badge-info">{m.customRole?.name ?? "No role"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>

        {canManage ? (
          <InviteSection
            roles={roles}
            invites={invites}
            onChanged={() => void reload()}
          />
        ) : (
          <p className="card p-5 text-sm text-slate-500">Your role can see the team but not change it.</p>
        )}
      </div>

      <SectionCard
        title="Roles"
        subtitle="Each role sets No access, View or Edit for every menu. Teammates get exactly what their role allows — on the web, in the app and through the API."
        actions={
          canManage && (
            <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
              New role
            </button>
          )
        }
        bodyClassName=""
      >
        <ul className="divide-y divide-slate-100">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{r.name}</p>
                <p className="text-sm text-slate-500">
                  {summarize(r.permissions)} · {DATA_SCOPE_LABELS[r.dataScope].toLowerCase()}
                  {!r.webAccess && " · mobile app only"}
                </p>
                {r.description && <p className="mt-0.5 text-xs text-slate-400">{r.description}</p>}
              </div>
              <span className="badge badge-neutral">
                {r.memberCount} {r.memberCount === 1 ? "person" : "people"}
              </span>
              {canManage && (
                <div className="flex gap-1">
                  <button type="button" className="btn-secondary py-1.5" onClick={() => setEditing(r)}>
                    Edit
                  </button>
                  <button type="button" className="btn-ghost px-2 text-red-600 hover:bg-red-50" onClick={() => void onDeleteRole(r)}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      <AttendanceCard />

      {editing && (
        <RoleEditor
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            setEditing(null);
            await reload();
            toast(`Saved "${saved.name}".`);
          }}
        />
      )}
    </div>
  );
}

function summarize(permissions: Permissions): string {
  const levels = Object.values(permissions);
  const edit = levels.filter((l) => l === "edit").length;
  const view = levels.filter((l) => l === "view").length;
  if (edit === levels.length) return "Full access";
  if (edit === 0 && view === 0) return "No menus";
  return [edit && `${edit} to edit`, view && `${view} to view`].filter(Boolean).join(", ");
}

function InviteSection({
  roles,
  invites,
  onChanged,
}: {
  roles: WorkspaceRole[];
  invites: Invite[];
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const defaultRole = roles.find((r) => r.name === "Sales agent") ?? roles[0];
  const [roleId, setRoleId] = useState(defaultRole?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!roleId && defaultRole) setRoleId(defaultRole.id);
  }, [roleId, defaultRole]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAcceptUrl(null);
    setSubmitting(true);
    try {
      const invite = await createInvite({ email, roleId });
      setAcceptUrl(invite.acceptUrl);
      setEmail("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(invite: Invite) {
    try {
      await revokeInvite(invite.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel the invite");
    }
  }

  const fullLink = acceptUrl && typeof window !== "undefined" ? `${window.location.origin}${acceptUrl}` : acceptUrl;
  const chosen = roles.find((r) => r.id === roleId);

  return (
    <section className="card p-5">
      <h2 className="font-bold text-slate-900">Invite a teammate</h2>
      <p className="mt-0.5 text-sm text-slate-500">They get a link to join this workspace.</p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3">
        <label className="block">
          <span className="field-label">Email</span>
          <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Role</span>
          <select required className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {chosen && !chosen.webAccess && (
            <span className="mt-1 block text-xs text-slate-500">This role signs in on the mobile app only.</span>
          )}
        </label>
        <button type="submit" disabled={submitting || !roleId} className="btn-primary">
          {submitting ? "Sending…" : "Send invite"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {fullLink && (
        <p className="mt-2 break-all text-sm text-brand-800">
          Invite created. Share this link with them: <code className="rounded bg-slate-100 px-1">{fullLink}</code>
        </p>
      )}

      {invites.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <p className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pending invites</p>
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-700">{inv.email}</p>
                <p className="text-xs text-slate-500">
                  {inv.customRole?.name ?? "No role"} · expires {new Date(inv.expiresAt).toLocaleDateString("en-IN")}
                </p>
              </div>
              <button type="button" onClick={() => void onRevoke(inv)} className="btn-ghost px-2 text-xs text-red-600 hover:bg-red-50">
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const LEVEL_STYLE: Record<AccessLevel, string> = {
  none: "bg-slate-600 text-white",
  view: "bg-brand-600 text-white",
  edit: "bg-leaf-500 text-white",
};

/** Create or edit a role: a level per menu, the data scope, and web access. */
function RoleEditor({
  role,
  onClose,
  onSaved,
}: {
  role: WorkspaceRole | null;
  onClose: () => void;
  onSaved: (role: WorkspaceRole) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<Permissions>(role?.permissions ?? DEFAULT_ROLE_TEMPLATES[1].permissions);
  const [dataScope, setDataScope] = useState<DataScope>(role?.dataScope ?? "own");
  const [webAccess, setWebAccess] = useState(role?.webAccess ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, (typeof ACCESS_MODULES)[number][]>();
    for (const m of ACCESS_MODULES) map.set(m.group, [...(map.get(m.group) ?? []), m]);
    return [...map];
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setAll(level: AccessLevel) {
    setPermissions((p) => Object.fromEntries(Object.keys(p).map((k) => [k, level])) as Permissions);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const input: WorkspaceRoleInput = { name: name.trim(), description: description.trim(), permissions, dataScope, webAccess };
    try {
      onSaved(role ? await updateRole(role.id, input) : await createRole(input));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4" onClick={onClose} role="presentation">
      <div
        className="my-8 w-full max-w-3xl animate-toast-in rounded-3xl bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={role ? `Edit ${role.name}` : "New role"}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">{role ? `Edit “${role.name}”` : "New role"}</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Role name</span>
              <input required maxLength={60} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accounts" />
            </label>
            <label className="block">
              <span className="field-label">Description (optional)</span>
              <input maxLength={300} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="field-label">Records they see</legend>
              {(["all", "own"] as DataScope[]).map((scope) => (
                <label key={scope} className="flex items-center gap-2 py-1 text-sm text-slate-700">
                  <input type="radio" name="scope" checked={dataScope === scope} onChange={() => setDataScope(scope)} />
                  {DATA_SCOPE_LABELS[scope]}
                </label>
              ))}
              <p className="text-xs text-slate-500">Applies to leads and their follow-ups, visits, quotations and payments.</p>
            </fieldset>
            <fieldset>
              <legend className="field-label">Where they sign in</legend>
              <label className="flex items-center gap-2 py-1 text-sm text-slate-700">
                <input type="radio" name="web" checked={webAccess} onChange={() => setWebAccess(true)} />
                Web dashboard and mobile app
              </label>
              <label className="flex items-center gap-2 py-1 text-sm text-slate-700">
                <input type="radio" name="web" checked={!webAccess} onChange={() => setWebAccess(false)} />
                Mobile app only
              </label>
            </fieldset>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="field-label mb-0">Menu access</span>
              <div className="flex gap-1 text-xs">
                <span className="self-center text-slate-500">Set all:</span>
                {ACCESS_LEVELS.map((level) => (
                  <button key={level} type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setAll(level)}>
                    {ACCESS_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
              {groups.map(([group, modules]) => (
                <div key={group}>
                  <p className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{group}</p>
                  {modules.map((m) => (
                    <div key={m.key} className="flex items-center gap-3 border-t border-slate-100 px-4 py-2">
                      <span className="flex-1 text-sm font-medium text-slate-700">{m.label}</span>
                      <div className="flex overflow-hidden rounded-lg border border-slate-200" role="radiogroup" aria-label={m.label}>
                        {ACCESS_LEVELS.map((level) => {
                          const active = permissions[m.key] === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setPermissions((p) => ({ ...p, [m.key]: level }))}
                              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                                active ? LEVEL_STYLE[level] : "bg-white text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              {ACCESS_LEVEL_LABELS[level]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Edit on “Team and roles” lets someone change everyone’s access, including their own role’s — give it only to admins.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : role ? "Save role" : "Create role"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function hoursMinutes(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function time(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—";
}

/** Who clocked in on a day, from the mobile app's Profile screen. */
function AttendanceCard() {
  const [day, setDay] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [data, setData] = useState<TeamAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getTeamAttendance(day)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load attendance"));
  }, [day]);

  return (
    <SectionCard
      title="Attendance"
      subtitle="Clock-ins from the mobile app."
      actions={<input type="date" className="input w-44 py-1.5" value={day} onChange={(e) => setDay(e.target.value)} />}
      bodyClassName=""
    >
      {error ? (
        <p className="px-5 py-4 text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="px-5 py-4 text-sm text-slate-500">Loading…</p>
      ) : data.people.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Nobody clocked in on this day.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-2">Person</th>
                <th className="px-5 py-2">First in</th>
                <th className="px-5 py-2">Last out</th>
                <th className="px-5 py-2">Worked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.people.map((p) => (
                <tr key={p.user.id}>
                  <td className="px-5 py-2.5 font-semibold text-slate-900">{p.user.name ?? p.user.email}</td>
                  <td className="px-5 py-2.5 text-slate-600">{time(p.firstIn)}</td>
                  <td className="px-5 py-2.5 text-slate-600">
                    {p.clockedIn ? <span className="badge badge-success">Clocked in</span> : time(p.lastOut)}
                  </td>
                  <td className="px-5 py-2.5 text-slate-600">{hoursMinutes(p.workedSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
