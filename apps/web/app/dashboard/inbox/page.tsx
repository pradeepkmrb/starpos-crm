"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type AuthUser,
  type InboxConversation,
  type InboxThread,
  type Label,
  type LabelColor,
  type Member,
  assignConversation,
  createLabel,
  getAccessToken,
  getConversation,
  listConversations,
  listLabels,
  listMembers,
  me,
  replyToConversation,
  setConversationLabels,
  updateContact,
} from "../../../lib/api";

/** Inbound messages arrive by webhook, so the list needs its own refresh. */
const POLL_INTERVAL_MS = 15_000;

type Tab = "all" | "mine" | "unassigned";

const LABEL_CLASSES: Record<LabelColor, string> = {
  slate: "bg-slate-100 text-slate-600",
  brand: "bg-brand-50 text-brand-800",
  green: "bg-brand-50 text-brand-800",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-500 text-white",
  purple: "bg-slate-200 text-slate-700",
};

function memberLabel(m: { name: string | null; email: string }): string {
  return m.name || m.email;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function windowHint(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const mins = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "";
  if (mins < 60) return `${mins}m left to reply`;
  return `${Math.round(mins / 60)}h left to reply`;
}

function displayName(c: { name: string | null; whatsappNumber: string }): string {
  return c.name ? `${c.name} · ${c.whatsappNumber}` : c.whatsappNumber;
}

export default function InboxPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<InboxThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, convosRes, labelsRes] = await Promise.all([
          me(),
          listConversations(),
          listLabels(),
        ]);
        setRole(meRes.role);
        setCurrentUser(meRes.user);
        setConversations(convosRes);
        setLabels(labelsRes);
        setActiveId((prev) => prev ?? convosRes[0]?.contactId ?? null);
        // Only admins can read the member list; agents still get the rest.
        listMembers().then(setMembers).catch(() => undefined);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load the inbox");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const refreshThread = useCallback(async (contactId: string, showSpinner: boolean) => {
    if (showSpinner) setThreadLoading(true);
    try {
      setThread(await getConversation(contactId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the conversation");
    } finally {
      if (showSpinner) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setThread(null);
    void refreshThread(activeId, true);
  }, [activeId, refreshThread]);

  // Webhook-delivered replies won't push to the browser, so poll both panes.
  useEffect(() => {
    if (!role) return;
    const timer = window.setInterval(() => {
      listConversations().then(setConversations).catch(() => undefined);
      if (activeId) void refreshThread(activeId, false);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [role, activeId, refreshThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  const counts = useMemo(
    () => ({
      all: conversations.length,
      mine: conversations.filter((c) => c.assignedUserId === currentUser?.id).length,
      unassigned: conversations.filter((c) => !c.assignedUserId).length,
    }),
    [conversations, currentUser],
  );

  const visible = useMemo(() => {
    const byTab = conversations.filter((c) => {
      if (tab === "mine") return c.assignedUserId === currentUser?.id;
      if (tab === "unassigned") return !c.assignedUserId;
      return true;
    });
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (c) =>
        c.whatsappNumber.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q) ||
        c.labels.some((l) => l.name.toLowerCase().includes(q)),
    );
  }, [conversations, search, tab, currentUser]);

  async function onAssign(userId: string | null) {
    if (!activeId) return;
    setError(null);
    try {
      const res = await assignConversation(activeId, userId);
      setThread((prev) =>
        prev
          ? {
              ...prev,
              contact: {
                ...prev.contact,
                assignedUserId: res.assignedUserId,
                assignedUser: res.assignedUser,
              },
            }
          : prev,
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.contactId === activeId
            ? { ...c, assignedUserId: res.assignedUserId, assignedUser: res.assignedUser }
            : c,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign the conversation");
    }
  }

  async function onToggleLabel(label: Label) {
    if (!thread || !activeId) return;
    const current = thread.contact.labels.map((l) => l.id);
    const next = current.includes(label.id)
      ? current.filter((id) => id !== label.id)
      : [...current, label.id];
    setError(null);
    try {
      const applied = await setConversationLabels(activeId, next);
      setThread((prev) => (prev ? { ...prev, contact: { ...prev.contact, labels: applied } } : prev));
      setConversations((prev) =>
        prev.map((c) => (c.contactId === activeId ? { ...c, labels: applied } : c)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update labels");
    }
  }

  async function onPatchContact(patch: {
    name?: string | null;
    email?: string | null;
    languageCode?: string | null;
    botEnabled?: boolean;
  }) {
    if (!activeId) return;
    setError(null);
    try {
      const updated = await updateContact(activeId, patch);
      setThread((prev) =>
        prev
          ? {
              ...prev,
              contact: {
                ...prev.contact,
                name: updated.name,
                email: updated.email,
                languageCode: updated.languageCode,
                botEnabled: updated.botEnabled,
              },
            }
          : prev,
      );
      setConversations((prev) =>
        prev.map((c) => (c.contactId === activeId ? { ...c, name: updated.name } : c)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update the contact");
    }
  }

  async function onCreateLabel(name: string) {
    setError(null);
    try {
      const label = await createLabel({ name });
      setLabels((prev) => [...prev, label].sort((a, b) => a.name.localeCompare(b.name)));
      await onToggleLabel(label);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the label");
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    setError(null);
    setSending(true);
    try {
      await replyToConversation(activeId, body);
      setDraft("");
      await refreshThread(activeId, false);
      listConversations().then(setConversations).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send the message");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!role) return null;

  const canReply = roleAtLeast(role, "agent");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
      <p className="mt-1 text-sm text-slate-500">
        Conversations with your contacts. Free-form replies are only possible within 24 hours of their last
        message — Meta&apos;s rule, not ours.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {conversations.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No conversations yet. They appear here once a contact messages your WhatsApp number, or once you
          send them a broadcast.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_1fr]">
          <aside className="card overflow-hidden">
            <div className="flex border-b border-slate-100">
              {(["all", "mine", "unassigned"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 px-2 py-2 text-sm font-medium capitalize ${
                    tab === t
                      ? "border-b-2 border-brand-800 text-brand-800"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {t} ({counts[t]})
                </button>
              ))}
            </div>
            <div className="border-b border-slate-100 p-3">
              <input
                className="input"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-100">
              {visible.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No conversations match “{search}”.</p>
              )}
              {visible.map((c) => (
                <button
                  key={c.contactId}
                  type="button"
                  onClick={() => setActiveId(c.contactId)}
                  className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${
                    c.contactId === activeId ? "bg-brand-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {c.name || c.whatsappNumber}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {c.lastMessageDirection === "outbound" && "You: "}
                    {c.lastMessagePreview}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {c.labels.map((l) => (
                      <span
                        key={l.id}
                        className={`rounded px-1 text-[10px] font-medium ${LABEL_CLASSES[l.color] ?? LABEL_CLASSES.slate}`}
                      >
                        {l.name}
                      </span>
                    ))}
                    {c.assignedUser && (
                      <span className="text-[10px] text-slate-500">@{memberLabel(c.assignedUser)}</span>
                    )}
                    {!c.windowOpen && (
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        Window closed
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="card flex min-h-[32rem] flex-col">
            {threadLoading || !thread ? (
              <p className="p-6 text-sm text-slate-500">Loading conversation…</p>
            ) : (
              <>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{displayName(thread.contact)}</p>
                    <p className="text-xs text-slate-500">
                      {thread.contact.optedIn ? "Opted in" : "Opted out"} · contact since{" "}
                      {new Date(thread.contact.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {thread.windowOpen ? (
                    <span className="badge badge-success">{windowHint(thread.windowExpiresAt)}</span>
                  ) : (
                    <span className="badge badge-warning">Reply window closed</span>
                  )}
                </header>

                {canReply && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      Assigned to
                      <select
                        className="input w-auto py-1"
                        value={thread.contact.assignedUserId ?? ""}
                        onChange={(e) => onAssign(e.target.value || null)}
                      >
                        <option value="">Unassigned</option>
                        {members.length === 0 && thread.contact.assignedUser && (
                          <option value={thread.contact.assignedUser.id}>
                            {memberLabel(thread.contact.assignedUser)}
                          </option>
                        )}
                        {members.map((m) => (
                          <option key={m.user.id} value={m.user.id}>
                            {memberLabel(m.user)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <LabelPicker
                      labels={labels}
                      applied={thread.contact.labels}
                      onToggle={onToggleLabel}
                      onCreate={onCreateLabel}
                      canCreate={roleAtLeast(role, "admin")}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={thread.contact.botEnabled}
                        onChange={(e) => onPatchContact({ botEnabled: e.target.checked })}
                      />
                      Enable Reply Bot
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditingContact((v) => !v)}
                      className="text-sm text-slate-600 underline hover:text-slate-900"
                    >
                      {editingContact ? "Close" : "Edit contact"}
                    </button>
                  </div>
                )}

                {canReply && editingContact && (
                  <ContactInfoForm
                    contact={thread.contact}
                    onSave={async (patch) => {
                      await onPatchContact(patch);
                      setEditingContact(false);
                    }}
                  />
                )}

                <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
                  {thread.messages.length === 0 && (
                    <p className="text-sm text-slate-500">No messages in this conversation yet.</p>
                  )}
                  {thread.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-sm rounded-lg px-3 py-2 text-sm shadow-card ${
                          m.direction === "outbound" ? "bg-brand-50 text-slate-900" : "bg-white text-slate-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {formatTime(m.createdAt)}
                          {m.direction === "outbound" && ` · ${m.status}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                {canReply ? (
                  thread.windowOpen ? (
                    <form onSubmit={onSend} className="flex items-end gap-2 border-t border-slate-100 p-3">
                      <textarea
                        className="input flex-1"
                        rows={2}
                        placeholder="Type a message…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void onSend(e as unknown as React.FormEvent);
                          }
                        }}
                      />
                      <button type="submit" disabled={sending || !draft.trim()} className="btn-primary">
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </form>
                  ) : (
                    <p className="border-t border-slate-100 p-4 text-sm text-slate-500">
                      You can&apos;t reply — they need to message you first to reopen the 24-hour window.
                      Send an approved template from Broadcasts to start the conversation again.
                    </p>
                  )
                ) : (
                  <p className="border-t border-slate-100 p-4 text-sm text-slate-500">
                    Your role can read conversations but not reply.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Labels are a shared, tenant-wide vocabulary, so this toggles membership of
 * existing ones and only creates a new label when an admin asks for one.
 */
function LabelPicker({
  labels,
  applied,
  onToggle,
  onCreate,
  canCreate,
}: {
  labels: Label[];
  applied: Label[];
  onToggle: (label: Label) => void;
  onCreate: (name: string) => void;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const appliedIds = new Set(applied.map((l) => l.id));

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-600">Labels</span>
      {applied.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onToggle(l)}
          title="Remove this label"
          className={`rounded px-2 py-0.5 text-xs font-medium ${LABEL_CLASSES[l.color] ?? LABEL_CLASSES.slate}`}
        >
          {l.name} ×
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-white"
      >
        + Label
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-10 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-card-hover">
          <div className="max-h-48 overflow-y-auto">
            {labels.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">No labels yet.</p>}
            {labels.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onToggle(l)}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-slate-50"
              >
                <input type="checkbox" readOnly checked={appliedIds.has(l.id)} />
                <span className="truncate">{l.name}</span>
              </button>
            ))}
          </div>
          {canCreate && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim();
                if (!name) return;
                onCreate(name);
                setNewName("");
              }}
              className="mt-2 flex gap-1 border-t border-slate-100 pt-2"
            >
              <input
                className="input py-1 text-xs"
                placeholder="New label"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="btn-secondary px-2 py-1 text-xs">
                Add
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Phone is the contact's identity in WhatsApp, so it is shown but never edited here. */
function ContactInfoForm({
  contact,
  onSave,
}: {
  contact: InboxThread["contact"];
  onSave: (patch: { name: string | null; email: string | null; languageCode: string | null }) => void;
}) {
  const [name, setName] = useState(contact.name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [languageCode, setLanguageCode] = useState(contact.languageCode ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: name.trim() || null,
          email: email.trim() || null,
          languageCode: languageCode.trim() || null,
        });
      }}
      className="grid gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:grid-cols-4"
    >
      <label className="block">
        <span className="field-label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className="field-label">Email</span>
        <input
          type="email"
          className="input"
          placeholder="optional"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="field-label">Language</span>
        <input
          className="input"
          placeholder="en"
          value={languageCode}
          onChange={(e) => setLanguageCode(e.target.value)}
        />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="btn-primary">
          Save
        </button>
        <span className="pb-2 text-xs text-slate-500">{contact.whatsappNumber}</span>
      </div>
    </form>
  );
}
