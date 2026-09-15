"use client";

import { useState } from "react";
import {
  ApiError,
  type Channel,
  type MessageLogEntry,
  disconnectChannel,
  listChannelMessages,
  testSend,
} from "../../../lib/api";

export function ChannelCard({ channel, canManage }: { channel: Channel; canManage: boolean }) {
  const [status, setStatus] = useState(channel.status);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<MessageLogEntry[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      setLoadingMessages(true);
      try {
        setMessages(await listChannelMessages(channel.id));
      } catch {
        // best-effort; the send form below will surface its own errors
      } finally {
        setLoadingMessages(false);
      }
    }
  }

  async function onDisconnect() {
    const updated = await disconnectChannel(channel.id);
    setStatus(updated.status);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-medium text-slate-900">
            {channel.displayPhoneNumber ?? channel.displayName ?? channel.externalId}
          </p>
          <p className="text-xs text-slate-500">
            WABA {channel.wabaId} · phone number id {channel.phoneNumberId}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${status === "active" ? "badge-success" : "badge-neutral"}`}>{status}</span>
          <button onClick={toggleExpanded} className="btn-secondary">
            {expanded ? "Hide" : "Manage"}
          </button>
          {canManage && status === "active" && (
            <button onClick={onDisconnect} className="btn-danger">
              Disconnect
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4">
          {canManage && <TestSendForm channelId={channel.id} onSent={(m) => setMessages((p) => [m, ...p])} />}

          <h3 className="mt-6 text-sm font-semibold text-slate-700">Recent messages</h3>
          {loadingMessages ? (
            <p className="mt-2 text-sm text-slate-500">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No messages yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {messages.map((m) => (
                <li key={m.id} className="flex justify-between py-2">
                  <span className="text-slate-700">
                    {m.direction === "inbound" ? "←" : "→"} {m.contact.whatsappNumber ?? m.contact.name ?? "contact"}
                  </span>
                  <span className="text-slate-500">
                    {m.status} · {new Date(m.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TestSendForm({
  channelId,
  onSent,
}: {
  channelId: string;
  onSent: (message: MessageLogEntry) => void;
}) {
  const [form, setForm] = useState({ to: "", templateName: "hello_world", languageCode: "en_US" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setSubmitting(true);
    try {
      const message = await testSend(channelId, form);
      onSent(message);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send test message");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700">Send a test template message</h3>
      <p className="mt-1 text-xs text-slate-500">
        The template must already exist and be approved in your Meta Business Manager.
      </p>
      <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">To (E.164)</span>
          <input
            required
            className="input"
            placeholder="15551234567"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Template name</span>
          <input
            required
            className="input"
            value={form.templateName}
            onChange={(e) => setForm({ ...form, templateName: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Language</span>
          <input
            required
            className="input"
            value={form.languageCode}
            onChange={(e) => setForm({ ...form, languageCode: e.target.value })}
          />
        </label>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Sending…" : "Send"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {sent && <p className="mt-2 text-sm text-brand-800">Sent — check the log below for delivery status.</p>}
    </div>
  );
}
