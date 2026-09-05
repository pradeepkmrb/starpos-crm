"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type InboxConversation,
  type InboxThread,
  getAccessToken,
  getConversation,
  listConversations,
  me,
  replyToConversation,
} from "../../../lib/api";

/** Inbound messages arrive by webhook, so the list needs its own refresh. */
const POLL_INTERVAL_MS = 15_000;

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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, convosRes] = await Promise.all([me(), listConversations()]);
        setRole(meRes.role);
        setConversations(convosRes);
        setActiveId((prev) => prev ?? convosRes[0]?.contactId ?? null);
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.whatsappNumber.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q),
    );
  }, [conversations, search]);

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
                  {!c.windowOpen && (
                    <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-slate-400">
                      Window closed
                    </span>
                  )}
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
