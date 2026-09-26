"use client";

import { useState } from "react";
import { ApiError, type Channel, createChannel } from "../../../lib/api";

export function ConnectChannelForm({
  onConnected,
  title = "Connect a WhatsApp channel",
}: {
  onConnected: (channel: Channel) => void;
  title?: string;
}) {
  const [form, setForm] = useState({
    wabaId: "",
    phoneNumberId: "",
    displayPhoneNumber: "",
    accessToken: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const channel = await createChannel(form);
      onConnected(channel);
      setForm({ wabaId: "", phoneNumberId: "", displayPhoneNumber: "", accessToken: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to connect channel");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Paste the WABA ID, phone number ID, and a system-user access token from your Meta app.
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">WABA ID</span>
          <input
            required
            className="input"
            value={form.wabaId}
            onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="field-label">Phone number ID</span>
          <input
            required
            className="input"
            value={form.phoneNumberId}
            onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="field-label">Display phone number</span>
          <input
            required
            className="input"
            placeholder="+1 555 000 1234"
            value={form.displayPhoneNumber}
            onChange={(e) => setForm({ ...form, displayPhoneNumber: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="field-label">Access token</span>
          <input
            required
            type="password"
            className="input"
            value={form.accessToken}
            onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
          />
        </label>

        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary sm:col-span-2">
          {submitting ? "Connecting…" : "Connect channel"}
        </button>
      </form>
    </section>
  );
}
