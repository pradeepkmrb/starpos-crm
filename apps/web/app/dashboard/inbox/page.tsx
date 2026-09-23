"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHANNEL_LABELS,
  CHANNEL_SHORT_LABELS,
  CHANNEL_TYPES,
  channelHasReplyWindow,
  roleAtLeast,
  type ChannelType,
  type TenantRole,
} from "@digitel/shared";
import {
  ApiError,
  type AuthUser,
  type Contact,
  type InboxConversation,
  type InboxThread,
  type Label,
  type LabelColor,
  type Member,
  type MessageTemplate,
  assignConversation,
  createLabel,
  getAccessToken,
  getConversation,
  listContacts,
  listConversations,
  listLabels,
  listMembers,
  listTemplates,
  me,
  replyToConversation,
  sendConversationTemplate,
  setConversationLabels,
  updateContact,
} from "../../../lib/api";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { EmptyState, PageHeader } from "../../../components/ui";
import { ChatIcon, CheckIcon, CloseIcon, PlugIcon, PlusIcon, SearchIcon, SlidersIcon } from "../../../components/icons";
import Link from "next/link";
import { Avatar } from "../../../components/Avatar";

/** Inbound messages arrive by webhook, so the list needs its own refresh. */
const POLL_INTERVAL_MS = 15_000;

type Tab = "all" | "mine" | "unassigned";

/** "all" plus one entry per channel — the filter above the conversation list. */
type ChannelFilter = ChannelType | "all";

/** A muted chip per channel, so a glance at the list says where a message came from. */
const CHANNEL_CLASSES: Record<ChannelType, string> = {
  whatsapp: "bg-brand-50 text-brand-800",
  facebook: "bg-slate-100 text-slate-600",
  instagram: "bg-amber-50 text-amber-800",
  email: "bg-slate-200 text-slate-700",
};

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

function displayName(c: { name: string | null; handle: string }): string {
  return c.name ? `${c.name} · ${c.handle}` : c.handle;
}

function ChannelChip({ type }: { type: ChannelType }) {
  return (
    <span className={`rounded-md px-1.5 py-px text-[10px] font-semibold ${CHANNEL_CLASSES[type]}`}>
      {CHANNEL_SHORT_LABELS[type]}
    </span>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** WhatsApp-style ticks: one for sent, two for delivered, two green for read. */
function Ticks({ status }: { status: string }) {
  if (status === "failed") return <span className="font-semibold text-red-200">Failed</span>;
  const double = status === "delivered" || status === "read";
  return (
    <span className={`inline-flex ${status === "read" ? "text-sky-200" : "text-white/70"}`} aria-label={status}>
      <CheckIcon className="h-3.5 w-3.5" />
      {double && <CheckIcon className="-ml-2 h-3.5 w-3.5" />}
    </span>
  );
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
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [reopenTemplateId, setReopenTemplateId] = useState("");
  const [reopening, setReopening] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const approvedTemplates = useMemo(
    () => templates.filter((t) => t.status === "approved"),
    [templates],
  );

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
        // Needed to reopen a closed window or start a new chat — not fatal if it fails.
        listTemplates().then(setTemplates).catch(() => undefined);
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
    setReopenTemplateId("");
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

  const counts = useMemo(() => {
    const inChannel = conversations.filter(
      (c) => channelFilter === "all" || c.channelType === channelFilter,
    );
    return {
      all: inChannel.length,
      mine: inChannel.filter((c) => c.assignedUserId === currentUser?.id).length,
      unassigned: inChannel.filter((c) => !c.assignedUserId).length,
    };
  }, [conversations, channelFilter, currentUser]);

  /** Only the channels that actually have conversations get a filter button. */
  const activeChannels = useMemo(() => {
    const present = new Set(conversations.map((c) => c.channelType));
    return CHANNEL_TYPES.filter((type) => present.has(type));
  }, [conversations]);

  const visible = useMemo(() => {
    const byTab = conversations.filter((c) => {
      if (channelFilter !== "all" && c.channelType !== channelFilter) return false;
      if (tab === "mine") return c.assignedUserId === currentUser?.id;
      if (tab === "unassigned") return !c.assignedUserId;
      return true;
    });
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (c) =>
        c.handle.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q) ||
        c.labels.some((l) => l.name.toLowerCase().includes(q)),
    );
  }, [conversations, search, tab, channelFilter, currentUser]);

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

  async function onReopenWithTemplate() {
    if (!activeId || !reopenTemplateId) return;
    setError(null);
    setReopening(true);
    try {
      await sendConversationTemplate(activeId, reopenTemplateId);
      setReopenTemplateId("");
      await refreshThread(activeId, false);
      listConversations().then(setConversations).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send the template");
    } finally {
      setReopening(false);
    }
  }

  async function onStartConversation(contactId: string, templateId: string) {
    await sendConversationTemplate(contactId, templateId);
    setShowNewChat(false);
    setActiveId(contactId);
    listConversations().then(setConversations).catch(() => undefined);
  }

  if (loading) return <PageSkeleton />;
  if (!role) return null;

  const canReply = roleAtLeast(role, "agent");

  const details = thread && (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={thread.contact.name || thread.contact.handle} size="h-16 w-16 text-xl" />
        <p className="mt-3 font-bold text-slate-900">{thread.contact.name || thread.contact.handle}</p>
        <p className="text-sm text-slate-500">{thread.contact.handle}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <ChannelChip type={thread.contact.channelType} />
          <span className={`badge ${thread.contact.optedIn ? "badge-success" : "badge-neutral"}`}>
            {thread.contact.optedIn ? "Opted in" : "Opted out"}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Contact since {new Date(thread.contact.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>

      {canReply && (
        <>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned to</p>
            <select
              className="input py-2"
              value={thread.contact.assignedUserId ?? ""}
              onChange={(e) => onAssign(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {members.length === 0 && thread.contact.assignedUser && (
                <option value={thread.contact.assignedUser.id}>{memberLabel(thread.contact.assignedUser)}</option>
              )}
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {memberLabel(m.user)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Labels</p>
            <LabelPicker
              labels={labels}
              applied={thread.contact.labels}
              onToggle={onToggleLabel}
              onCreate={onCreateLabel}
              canCreate={roleAtLeast(role, "admin")}
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span>
              <span className="block text-sm font-semibold text-slate-800">Reply bot</span>
              <span className="block text-xs text-slate-500">Let flows answer this contact</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={thread.contact.botEnabled}
              onChange={(e) => onPatchContact({ botEnabled: e.target.checked })}
            />
          </label>
          <div>
            <button
              type="button"
              onClick={() => setEditingContact((v) => !v)}
              className="btn-secondary w-full py-2"
            >
              {editingContact ? "Close" : "Edit contact"}
            </button>
            {editingContact && (
              <ContactInfoForm
                contact={thread.contact}
                onSave={async (patch) => {
                  await onPatchContact(patch);
                  setEditingContact(false);
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );

  let lastDay = "";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ChatIcon}
        title="Inbox"
        subtitle="WhatsApp, Messenger, Instagram and email in one place. Meta channels allow free replies for 24 hours after the contact's last message."
        actions={
          canReply && (
            <button type="button" onClick={() => setShowNewChat(true)} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New chat
            </button>
          )
        }
      />

      {showNewChat && (
        <NewChatModal
          templates={approvedTemplates}
          existingContactIds={new Set(conversations.map((c) => c.contactId))}
          onClose={() => setShowNewChat(false)}
          onStart={onStartConversation}
        />
      )}

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {conversations.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ChatIcon}
            title="No conversations yet"
            text="Chats appear here when someone messages a connected channel, or after you send them a broadcast."
            action={
              <Link href="/dashboard/channels" className="btn-primary">
                <PlugIcon className="h-4 w-4" />
                Connect a channel
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card relative grid h-[calc(100vh-13rem)] min-h-[34rem] overflow-hidden lg:grid-cols-[21rem_1fr] xl:grid-cols-[21rem_1fr_18rem]">
          <aside className="flex min-h-0 flex-col border-r border-slate-100">
            <div className="space-y-3 border-b border-slate-100 p-3">
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {(["all", "mine", "unassigned"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {t} <span className="text-slate-400">{counts[t]}</span>
                  </button>
                ))}
              </div>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="input py-2 pl-9"
                  placeholder="Search conversations"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {activeChannels.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {(["all", ...activeChannels] as ChannelFilter[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setChannelFilter(type)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        channelFilter === type ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {type === "all" ? "All channels" : CHANNEL_SHORT_LABELS[type]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 && (
                <p className="p-6 text-center text-sm text-slate-500">
                  {search ? `No conversations match “${search}”.` : "Nothing here."}
                </p>
              )}
              {visible.map((c) => {
                const active = c.contactId === activeId;
                return (
                  <button
                    key={c.contactId}
                    type="button"
                    onClick={() => setActiveId(c.contactId)}
                    className={`flex w-full gap-3 border-l-[3px] px-3 py-3 text-left transition-colors ${
                      active ? "border-brand-600 bg-brand-50/70" : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <Avatar name={c.name || c.handle} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-900">{c.name || c.handle}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(c.lastMessageAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-500">
                        {c.lastMessageDirection === "outbound" && <span className="text-slate-400">You: </span>}
                        {c.lastMessagePreview}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <ChannelChip type={c.channelType} />
                        {c.labels.map((l) => (
                          <span
                            key={l.id}
                            className={`rounded-md px-1.5 py-px text-[10px] font-semibold ${LABEL_CLASSES[l.color] ?? LABEL_CLASSES.slate}`}
                          >
                            {l.name}
                          </span>
                        ))}
                        {c.assignedUser && <span className="text-[10px] text-slate-500">@{memberLabel(c.assignedUser)}</span>}
                        {channelHasReplyWindow(c.channelType) && !c.windowOpen && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Closed</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            {threadLoading || !thread ? (
              <div className="space-y-3 p-6">
                <div className="skeleton h-12 w-64" />
                <div className="skeleton h-16 w-80" />
                <div className="skeleton ml-auto h-16 w-72" />
              </div>
            ) : (
              <>
                <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <Avatar name={thread.contact.name || thread.contact.handle} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{thread.contact.name || thread.contact.handle}</p>
                    <p className="truncate text-xs text-slate-500">
                      {CHANNEL_LABELS[thread.contact.channelType]} · {thread.contact.handle}
                      {thread.contact.assignedUser && ` · assigned to ${memberLabel(thread.contact.assignedUser)}`}
                    </p>
                  </div>
                  {!channelHasReplyWindow(thread.contact.channelType) ? (
                    <span className="badge badge-neutral">No reply window</span>
                  ) : thread.windowOpen ? (
                    <span className="badge badge-success">{windowHint(thread.windowExpiresAt)}</span>
                  ) : (
                    <span className="badge badge-warning">Window closed</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="btn-ghost px-2 xl:hidden"
                    aria-label="Contact details"
                  >
                    <SlidersIcon className="h-5 w-5" />
                  </button>
                </header>

                <div
                  className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#f2f5f3] px-4 py-5 sm:px-8"
                  style={{ backgroundImage: "radial-gradient(rgba(5,150,105,0.07) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
                >
                  {thread.messages.length === 0 && (
                    <p className="text-center text-sm text-slate-500">No messages in this conversation yet.</p>
                  )}
                  {thread.messages.map((m) => {
                    const day = dayLabel(m.createdAt);
                    const showDay = day !== lastDay;
                    lastDay = day;
                    const out = m.direction === "outbound";
                    return (
                      <div key={m.id}>
                        {showDay && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                              {day}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                              out ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-slate-800"
                            }`}
                            title={formatTime(m.createdAt)}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                            <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${out ? "text-white/70" : "text-slate-400"}`}>
                              {clock(m.createdAt)}
                              {out && <Ticks status={m.status} />}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {canReply ? (
                  thread.windowOpen ? (
                    <form onSubmit={onSend} className="flex items-end gap-2 border-t border-slate-100 bg-white p-3">
                      <textarea
                        className="input min-h-[44px] flex-1 resize-none rounded-2xl py-2.5"
                        rows={1}
                        placeholder={`Message on ${CHANNEL_LABELS[thread.contact.channelType]}…`}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void onSend(e as unknown as React.FormEvent);
                          }
                        }}
                      />
                      <button type="submit" disabled={sending || !draft.trim()} className="btn-primary h-11 rounded-2xl px-5">
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </form>
                  ) : (
                    <div className="border-t border-slate-100 bg-amber-50/60 p-4 text-sm text-amber-900">
                      <p>The 24-hour reply window is closed — they need to message you first, or you can restart the chat with an approved template.</p>
                      {thread.contact.channelType === "whatsapp" ? (
                        approvedTemplates.length > 0 ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <select
                              className="input py-2 text-sm"
                              value={reopenTemplateId}
                              onChange={(e) => setReopenTemplateId(e.target.value)}
                            >
                              <option value="">Choose a template…</option>
                              {approvedTemplates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.language})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!reopenTemplateId || reopening}
                              onClick={onReopenWithTemplate}
                              className="btn-primary py-2"
                            >
                              {reopening ? "Sending…" : "Send template"}
                            </button>
                          </div>
                        ) : (
                          <p className="mt-2">
                            No approved templates yet — create one in the{" "}
                            <Link href="/dashboard/campaigns" className="font-semibold underline">
                              Message library
                            </Link>
                            .
                          </p>
                        )
                      ) : (
                        <p className="mt-1">They need to message you again before you can reply here.</p>
                      )}
                    </div>
                  )
                ) : (
                  <p className="border-t border-slate-100 p-4 text-sm text-slate-500">Your role can read conversations but not reply.</p>
                )}
              </>
            )}
          </section>

          {thread && (
            <aside
              className={`min-h-0 overflow-y-auto border-l border-slate-100 bg-white p-5 xl:block ${
                showDetails ? "absolute inset-y-0 right-0 z-10 w-80 shadow-pop" : "hidden"
              } xl:static xl:w-auto xl:shadow-none`}
            >
              {details}
            </aside>
          )}
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
      {applied.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onToggle(l)}
          title="Remove this label"
          className={`rounded-lg px-2 py-1 text-xs font-semibold ${LABEL_CLASSES[l.color] ?? LABEL_CLASSES.slate}`}
        >
          {l.name} ×
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-dashed border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700"
      >
        + Label
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-20 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-pop">
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

/**
 * Starting a conversation is only possible with an approved WhatsApp
 * template — Meta rejects free text to a contact who hasn't messaged in yet.
 * Only WhatsApp contacts with no conversation yet are worth listing here;
 * everyone else already has a row in the Inbox to reopen from.
 */
function NewChatModal({
  templates,
  existingContactIds,
  onClose,
  onStart,
}: {
  templates: MessageTemplate[];
  existingContactIds: Set<string>;
  onClose: () => void;
  onStart: (contactId: string, templateId: string) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listContacts(1000)
      .then(setContacts)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load contacts"));
  }, []);

  const candidates = useMemo(() => {
    if (!contacts) return [];
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => c.channelType === "whatsapp" && !existingContactIds.has(c.id))
      .filter(
        (c) =>
          !q ||
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.whatsappNumber ?? "").toLowerCase().includes(q) ||
          (c.externalId ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [contacts, search, existingContactIds]);

  async function handleStart() {
    if (!contactId || !templateId) return;
    setError(null);
    setStarting(true);
    try {
      await onStart(contactId, templateId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start the conversation");
      setStarting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-8 w-full max-w-md animate-toast-in rounded-3xl bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Start a new chat"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">New chat</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Reach a WhatsApp contact who hasn't messaged you yet — Meta only allows this with an approved template.
        </p>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loadError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

        <div className="mt-4 space-y-3">
          <div>
            <p className="field-label mb-1">Contact</p>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input py-2 pl-9"
                placeholder="Search contacts by name or number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-100">
              {contacts === null && !loadError && (
                <p className="p-3 text-center text-sm text-slate-500">Loading contacts…</p>
              )}
              {contacts !== null && candidates.length === 0 && (
                <p className="p-3 text-center text-sm text-slate-500">
                  No WhatsApp contacts without an existing chat match that search.
                </p>
              )}
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setContactId(c.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                    contactId === c.id ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={c.name || c.whatsappNumber || c.externalId || "?"} size="h-8 w-8 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-800">
                      {c.name || c.whatsappNumber || c.externalId}
                    </span>
                    {c.name && <span className="block truncate text-xs text-slate-500">{c.whatsappNumber ?? c.externalId}</span>}
                  </span>
                  {contactId === c.id && <CheckIcon className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label mb-1">Template</p>
            {templates.length === 0 ? (
              <p className="text-sm text-slate-500">
                No approved templates yet — create one in the{" "}
                <Link href="/dashboard/campaigns" className="font-semibold underline">
                  Message library
                </Link>
                .
              </p>
            ) : (
              <select className="input py-2" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="button"
            disabled={!contactId || !templateId || starting}
            onClick={handleStart}
            className="btn-primary w-full py-2.5"
          >
            {starting ? "Starting…" : "Start conversation"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Their channel address is their identity, so it is shown but never edited here. */
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
      className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-3"
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
          // On the email channel this is the contact's identity, not a spare field.
          disabled={contact.channelType === "email"}
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
      <button type="submit" className="btn-primary">
        Save contact
      </button>
    </form>
  );
}
