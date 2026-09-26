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
  type Channel,
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
  listChannels,
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
import { EmptyState } from "../../../components/ui";
import {
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SlidersIcon,
} from "../../../components/icons";
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
  if (status === "failed") return <span className="font-semibold text-red-600">Failed</span>;
  const double = status === "delivered" || status === "read";
  return (
    <span className={`inline-flex ${status === "read" ? "text-wa-read" : "text-wa-muted"}`} aria-label={status}>
      <CheckIcon className="h-3.5 w-3.5" />
      {double && <CheckIcon className="-ml-2 h-3.5 w-3.5" />}
    </span>
  );
}

/** The little corner that points a run of bubbles at its sender, as on WhatsApp. */
function BubbleTail({ out }: { out: boolean }) {
  return (
    <svg
      viewBox="0 0 8 13"
      className={`absolute top-0 h-[13px] w-2 ${out ? "-right-2 text-wa-out" : "-left-2 -scale-x-100 text-white"}`}
      aria-hidden="true"
    >
      <path fill="currentColor" d="M0 0h8L1.5 9.5C.9 10.4 0 10 0 9V0z" />
    </svg>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
        active ? "bg-[#d9fdd3] text-wa-green-dark" : "bg-wa-panel text-wa-muted hover:bg-wa-active"
      }`}
    >
      {children}
    </button>
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
  /** Phones show one pane at a time, like the WhatsApp app: the list, or an open chat. */
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [reopenTemplateId, setReopenTemplateId] = useState("");
  const [reopenChannelId, setReopenChannelId] = useState("");
  const [reopening, setReopening] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  /** Active WhatsApp numbers — a template can be sent from any of them. */
  const [numbers, setNumbers] = useState<Channel[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const approvedTemplates = useMemo(
    () => templates.filter((t) => t.status === "approved"),
    [templates],
  );

  // Defaults to the number the conversation is already on, so replies stay put.
  const reopenNumber =
    numbers.find((n) => n.id === reopenChannelId) ?? numbers.find((n) => n.id === thread?.channelId) ?? numbers[0];
  const reopenTemplates = templatesForNumber(approvedTemplates, numbers, reopenNumber);

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
        listChannels()
          .then((cs) => setNumbers(cs.filter((c) => c.status === "active")))
          .catch(() => undefined);
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
    setReopenChannelId("");
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
      await sendConversationTemplate(activeId, reopenTemplateId, reopenNumber?.id);
      setReopenTemplateId("");
      setReopenChannelId("");
      await refreshThread(activeId, false);
      listConversations().then(setConversations).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send the template");
    } finally {
      setReopening(false);
    }
  }

  async function onStartConversation(contactId: string, templateId: string, channelId?: string) {
    await sendConversationTemplate(contactId, templateId, channelId);
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
    <div className="relative flex h-[calc(100dvh-65px)] flex-col bg-wa-panel">
      {showNewChat && (
        <NewChatModal
          templates={approvedTemplates}
          numbers={numbers}
          existingContactIds={new Set(conversations.map((c) => c.contactId))}
          onClose={() => setShowNewChat(false)}
          onStart={onStartConversation}
        />
      )}

      {error && (
        <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-red-50 px-4 py-2.5 text-sm text-red-700 shadow">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="rounded p-1 hover:bg-red-100" aria-label="Dismiss">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={ChatIcon}
            title="No conversations yet"
            text="Chats appear here when someone messages a connected channel, or after you send them a broadcast."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {canReply && (
                  <button type="button" onClick={() => setShowNewChat(true)} className="btn-primary">
                    <PlusIcon className="h-4 w-4" />
                    New chat
                  </button>
                )}
                <Link href="/dashboard/channels" className="btn-secondary">
                  <PlugIcon className="h-4 w-4" />
                  Connect a channel
                </Link>
              </div>
            }
          />
        </div>
      ) : (
        <div
          className={`grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,30%)_1fr] ${
            showDetails && thread ? "xl:grid-cols-[minmax(20rem,28%)_1fr_24rem]" : ""
          }`}
        >
          {/* Chat list */}
          <aside
            className={`${mobileView === "chat" ? "hidden" : "flex"} min-h-0 flex-col border-r border-wa-line bg-white lg:flex`}
          >
            <div className="flex h-16 shrink-0 items-center justify-between bg-wa-panel px-4">
              <h1 className="text-xl font-bold text-wa-ink">Chats</h1>
              {canReply && (
                <button
                  type="button"
                  onClick={() => setShowNewChat(true)}
                  className="rounded-full p-2 text-wa-muted hover:bg-black/5"
                  aria-label="New chat"
                  title="New chat"
                >
                  <PlusIcon className="h-6 w-6" />
                </button>
              )}
            </div>

            <div className="space-y-2.5 border-b border-wa-line px-3 py-2.5">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wa-muted" />
                <input
                  className="h-9 w-full rounded-lg border-0 bg-wa-panel pl-11 pr-3 text-sm text-wa-ink placeholder:text-wa-muted focus:outline-none focus:ring-2 focus:ring-wa-green/30"
                  placeholder="Search or start a new chat"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "mine", "unassigned"] as Tab[]).map((t) => (
                  <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
                    <span className="capitalize">{t}</span>
                    <span className="ml-1 opacity-60">{counts[t]}</span>
                  </Pill>
                ))}
                {activeChannels.length > 1 && <span className="mx-0.5 w-px self-stretch bg-wa-line" aria-hidden="true" />}
                {activeChannels.length > 1 &&
                  (["all", ...activeChannels] as ChannelFilter[]).map((type) => (
                    <Pill key={`ch-${type}`} active={channelFilter === type} onClick={() => setChannelFilter(type)}>
                      {type === "all" ? "All channels" : CHANNEL_SHORT_LABELS[type]}
                    </Pill>
                  ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 && (
                <p className="p-6 text-center text-sm text-wa-muted">
                  {search ? `No conversations match “${search}”.` : "Nothing here."}
                </p>
              )}
              {visible.map((c) => {
                const active = c.contactId === activeId;
                return (
                  <button
                    key={c.contactId}
                    type="button"
                    onClick={() => {
                      setActiveId(c.contactId);
                      setMobileView("chat");
                    }}
                    className={`flex w-full items-center gap-3 pl-3 text-left transition-colors ${
                      active ? "bg-wa-active" : "hover:bg-wa-panel"
                    }`}
                  >
                    <Avatar name={c.name || c.handle} size="h-12 w-12 text-base" />
                    <div className="min-w-0 flex-1 border-b border-wa-line py-3 pr-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[16px] text-wa-ink">{c.name || c.handle}</span>
                        <span className="shrink-0 text-xs text-wa-muted">{relativeTime(c.lastMessageAt)}</span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-wa-muted">
                        {c.lastMessageDirection === "outbound" && <CheckIcon className="h-4 w-4 shrink-0 text-wa-muted" />}
                        <span className="truncate">{c.lastMessagePreview}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <ChannelChip type={c.channelType} />
                        {c.labels.map((l) => (
                          <span
                            key={l.id}
                            className={`rounded-md px-1.5 py-px text-[10px] font-semibold ${LABEL_CLASSES[l.color] ?? LABEL_CLASSES.slate}`}
                          >
                            {l.name}
                          </span>
                        ))}
                        {c.assignedUser && <span className="text-[10px] text-wa-muted">@{memberLabel(c.assignedUser)}</span>}
                        {channelHasReplyWindow(c.channelType) && !c.windowOpen && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-wa-muted">Closed</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Conversation */}
          <section className={`${mobileView === "list" ? "hidden" : "flex"} min-h-0 min-w-0 flex-col bg-wa-chat lg:flex`}>
            {threadLoading || !thread ? (
              activeId ? (
                <div className="flex-1 space-y-3 p-6">
                  <div className="skeleton h-12 w-64" />
                  <div className="skeleton h-16 w-80" />
                  <div className="skeleton ml-auto h-16 w-72" />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 border-b-[6px] border-wa-green bg-wa-panel p-8 text-center">
                  <ChatIcon className="h-16 w-16 text-wa-muted/50" />
                  <p className="text-2xl font-light text-wa-ink">Digitell Inbox</p>
                  <p className="max-w-md text-sm text-wa-muted">
                    Pick a chat on the left. WhatsApp, Messenger, Instagram and email all land here; Meta channels allow
                    free replies for 24 hours after the contact&apos;s last message.
                  </p>
                </div>
              )
            ) : (
              <>
                <header className="flex h-16 shrink-0 items-center gap-3 border-l border-wa-line bg-wa-panel px-4">
                  <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    className="-ml-2 rounded-full p-1.5 text-wa-muted hover:bg-black/5 lg:hidden"
                    aria-label="Back to chats"
                  >
                    <ChevronRightIcon className="h-5 w-5 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    title="Contact info"
                  >
                    <Avatar name={thread.contact.name || thread.contact.handle} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] text-wa-ink">{thread.contact.name || thread.contact.handle}</span>
                      <span className="block truncate text-xs text-wa-muted">
                        {CHANNEL_LABELS[thread.contact.channelType]} · {thread.contact.handle}
                        {numbers.length > 1 && thread.contact.channelType === "whatsapp" && (() => {
                          const via = numbers.find((n) => n.id === thread.channelId);
                          return via ? ` · via ${numberLabel(via)}` : null;
                        })()}
                        {thread.contact.assignedUser && ` · assigned to ${memberLabel(thread.contact.assignedUser)}`}
                      </span>
                    </span>
                  </button>
                  {!channelHasReplyWindow(thread.contact.channelType) ? (
                    <span className="badge badge-neutral hidden sm:inline-flex">No reply window</span>
                  ) : thread.windowOpen ? (
                    <span className="badge badge-success hidden sm:inline-flex">{windowHint(thread.windowExpiresAt)}</span>
                  ) : (
                    <span className="badge badge-warning hidden sm:inline-flex">Window closed</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className={`rounded-full p-2 text-wa-muted hover:bg-black/5 ${showDetails ? "bg-black/5" : ""}`}
                    aria-label="Contact info"
                    title="Contact info"
                  >
                    <SlidersIcon className="h-5 w-5" />
                  </button>
                </header>

                <div className="wa-wallpaper min-h-0 flex-1 overflow-y-auto px-[4%] py-4 lg:px-[7%]">
                  {thread.messages.length === 0 && (
                    <div className="mt-6 flex justify-center">
                      <span className="rounded-lg bg-[#fff5c4] px-3 py-1.5 text-xs text-wa-ink shadow-sm">
                        No messages in this conversation yet.
                      </span>
                    </div>
                  )}
                  {thread.messages.map((m, i) => {
                    const day = dayLabel(m.createdAt);
                    const showDay = day !== lastDay;
                    lastDay = day;
                    const out = m.direction === "outbound";
                    // Like WhatsApp, only the first bubble of a run gets a tail.
                    const first = showDay || i === 0 || thread.messages[i - 1]!.direction !== m.direction;
                    return (
                      <div key={m.id}>
                        {showDay && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium uppercase text-wa-muted shadow-sm">
                              {day}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${out ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"}`}>
                          <div
                            className={`relative max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.2px] text-wa-ink shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[65%] ${
                              out ? "bg-wa-out" : "bg-white"
                            } ${first ? (out ? "rounded-tr-none" : "rounded-tl-none") : ""}`}
                            title={formatTime(m.createdAt)}
                          >
                            {first && <BubbleTail out={out} />}
                            <p className="whitespace-pre-wrap break-words leading-[19px]">
                              {m.text}
                              {/* Reserves room so the time never overlaps the last line. */}
                              <span className={`inline-block ${out ? "w-[4.5rem]" : "w-12"}`} />
                            </p>
                            <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[11px] text-wa-muted">
                              {clock(m.createdAt)}
                              {out && <Ticks status={m.status} />}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {canReply ? (
                  thread.windowOpen ? (
                    <form onSubmit={onSend} className="flex shrink-0 items-end gap-2 bg-wa-panel px-4 py-2.5">
                      <textarea
                        className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border-0 bg-white px-4 py-2.5 text-[15px] text-wa-ink placeholder:text-wa-muted focus:outline-none focus:ring-0"
                        rows={1}
                        placeholder="Type a message"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void onSend(e as unknown as React.FormEvent);
                          }
                        }}
                      />
                      <button
                        type="submit"
                        disabled={sending || !draft.trim()}
                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-wa-green text-white transition-opacity hover:bg-wa-green-dark disabled:opacity-50"
                        aria-label="Send"
                        title="Send"
                      >
                        <SendIcon className="h-5 w-5" />
                      </button>
                    </form>
                  ) : (
                    <div className="shrink-0 bg-wa-panel px-4 py-3 text-sm text-wa-ink">
                      <p className="text-wa-muted">
                        The 24-hour reply window is closed — they need to message you first, or you can restart the chat with an
                        approved template.
                      </p>
                      {thread.contact.channelType === "whatsapp" ? (
                        approvedTemplates.length > 0 ? (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {numbers.length > 1 && reopenNumber && (
                              <select
                                className="h-[42px] rounded-lg border-0 bg-white px-3 text-sm text-wa-ink focus:ring-2 focus:ring-wa-green/30"
                                aria-label="Send from"
                                value={reopenNumber.id}
                                onChange={(e) => {
                                  setReopenChannelId(e.target.value);
                                  setReopenTemplateId("");
                                }}
                              >
                                {numbers.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    From {numberLabel(n)}
                                  </option>
                                ))}
                              </select>
                            )}
                            <select
                              className="h-[42px] min-w-0 flex-1 rounded-lg border-0 bg-white px-3 text-sm text-wa-ink focus:ring-2 focus:ring-wa-green/30"
                              value={reopenTemplateId}
                              onChange={(e) => setReopenTemplateId(e.target.value)}
                            >
                              <option value="">
                                {reopenTemplates.length > 0 ? "Choose a template…" : "No approved templates for this number"}
                              </option>
                              {reopenTemplates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.language})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!reopenTemplateId || reopening}
                              onClick={onReopenWithTemplate}
                              className="flex h-[42px] shrink-0 items-center gap-2 rounded-full bg-wa-green px-5 text-sm font-semibold text-white hover:bg-wa-green-dark disabled:opacity-50"
                            >
                              <SendIcon className="h-4 w-4" />
                              {reopening ? "Sending…" : "Send template"}
                            </button>
                          </div>
                        ) : (
                          <p className="mt-2">
                            No approved templates yet — create one in the{" "}
                            <Link href="/dashboard/campaigns" className="font-semibold text-wa-green-dark underline">
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
                  <p className="shrink-0 bg-wa-panel px-4 py-3 text-sm text-wa-muted">Your role can read conversations but not reply.</p>
                )}
              </>
            )}
          </section>

          {/* Contact info — slides over the chat below xl, its own column above */}
          {thread && showDetails && (
            <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-wa-line bg-white shadow-pop xl:static xl:max-w-none xl:shadow-none">
              <div className="flex h-16 shrink-0 items-center gap-4 bg-wa-panel px-4">
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="rounded-full p-1.5 text-wa-muted hover:bg-black/5"
                  aria-label="Close contact info"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
                <p className="text-[16px] text-wa-ink">Contact info</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">{details}</div>
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

function numberLabel(n: Channel) {
  return n.displayPhoneNumber || n.displayName || n.phoneNumberId || "WhatsApp number";
}

/**
 * Templates are approved per WABA, so a number can send any template that
 * belongs to a channel on its own WABA. With no number known, show them all.
 */
function templatesForNumber(templates: MessageTemplate[], numbers: Channel[], number: Channel | undefined) {
  if (!number) return templates;
  const sameWaba = new Set(numbers.filter((n) => n.wabaId === number.wabaId).map((n) => n.id));
  sameWaba.add(number.id);
  return templates.filter((t) => sameWaba.has(t.channelId));
}

/**
 * Starting a conversation is only possible with an approved WhatsApp
 * template — Meta rejects free text to a contact who hasn't messaged in yet.
 * Only WhatsApp contacts with no conversation yet are worth listing here;
 * everyone else already has a row in the Inbox to reopen from.
 */
function NewChatModal({
  templates: allTemplates,
  numbers,
  existingContactIds,
  onClose,
  onStart,
}: {
  templates: MessageTemplate[];
  numbers: Channel[];
  existingContactIds: Set<string>;
  onClose: () => void;
  onStart: (contactId: string, templateId: string, channelId?: string) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const number = numbers.find((n) => n.id === channelId) ?? numbers[0];
  const templates = templatesForNumber(allTemplates, numbers, number);
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
      await onStart(contactId, templateId, number?.id);
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

          {numbers.length > 1 && number && (
            <div>
              <p className="field-label mb-1">Send from</p>
              <select
                className="input py-2"
                value={number.id}
                onChange={(e) => {
                  setChannelId(e.target.value);
                  setTemplateId("");
                }}
              >
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {numberLabel(n)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="field-label mb-1">Template</p>
            {templates.length === 0 ? (
              <p className="text-sm text-slate-500">
                No approved templates {allTemplates.length > 0 ? "for this number" : "yet"} — create one in the{" "}
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
