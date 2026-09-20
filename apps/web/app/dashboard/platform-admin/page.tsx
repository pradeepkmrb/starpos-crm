"use client";

import { useEffect, useState } from "react";
import { ApiError, getPlatformSettings, updatePlatformSettings, type PlatformSettings } from "../../../lib/api";
import { PageSkeleton } from "../../../components/PageSkeleton";

export default function PlatformAdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load platform settings"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!settings) return null;

  return (
    <div>
      <p className="text-sm text-slate-500">
        Configure the shared Meta App credentials that power WhatsApp Embedded Signup for every
        customer on this platform.
      </p>

      <SettingsForm initial={settings} onSaved={setSettings} />
    </div>
  );
}

function SettingsForm({
  initial,
  onSaved,
}: {
  initial: PlatformSettings;
  onSaved: (settings: PlatformSettings) => void;
}) {
  const [metaAppId, setMetaAppId] = useState(initial.metaAppId ?? "");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [configId, setConfigId] = useState(initial.embeddedSignupConfigId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const updated = await updatePlatformSettings({
        metaAppId,
        metaEmbeddedSignupConfigId: configId,
        ...(metaAppSecret ? { metaAppSecret } : {}),
      });
      onSaved(updated);
      setMetaAppSecret("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card mt-6 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Meta App credentials</h2>
        <span className={`badge ${initial.hasSecret ? "badge-success" : "badge-neutral"}`}>
          {initial.hasSecret ? "Configured" : "Not configured"}
        </span>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="field-label">Meta App ID</span>
          <input required className="input" value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Meta App Secret</span>
          <input
            type="password"
            className="input"
            placeholder={initial.hasSecret ? "•••••••••••••••• (leave blank to keep current)" : ""}
            value={metaAppSecret}
            onChange={(e) => setMetaAppSecret(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">Embedded Signup Configuration ID</span>
          <input required className="input" value={configId} onChange={(e) => setConfigId(e.target.value)} />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-brand-800">Settings saved.</p>}

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>
    </section>
  );
}
