"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INTEGRATION_CATEGORY_LABELS,
  roleAtLeast,
  type IntegrationCategory,
  type TenantRole,
} from "@digitel/shared";
import {
  ApiError,
  type Integration,
  connectIntegration,
  disconnectIntegration,
  getAccessToken,
  listIntegrations,
  me,
  setIntegrationActive,
  testIntegration,
} from "../../../lib/api";
import { IntegrationCard } from "./IntegrationCard";
import { PageSkeleton } from "../../../components/PageSkeleton";

export default function IntegrationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<IntegrationCategory | "all">("all");
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const canManage = role ? roleAtLeast(role, "admin") : false;

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, list] = await Promise.all([me(), listIntegrations()]);
        setRole(meRes.role);
        setIntegrations(list);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load integrations");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Only categories that actually hold something are offered as filters.
  const categories = useMemo(
    () => Array.from(new Set(integrations.map((i) => i.category))) as IntegrationCategory[],
    [integrations],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return integrations.filter((integration) => {
      if (category !== "all" && integration.category !== category) return false;
      if (!q) return true;
      return [integration.name, integration.description, integration.category].some((value) =>
        value.toLowerCase().includes(q),
      );
    });
  }, [integrations, search, category]);

  const connectedCount = integrations.filter((i) => i.connection?.status === "connected").length;

  function replace(updated: Integration) {
    setIntegrations((prev) => prev.map((i) => (i.provider === updated.provider ? updated : i)));
  }

  async function run(provider: string, action: () => Promise<void>) {
    setBusyProvider(provider);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusyProvider(null);
    }
  }

  async function onConnect(integration: Integration, credentials: Record<string, string>) {
    await run(integration.provider, async () => {
      const updated = await connectIntegration(integration.provider, credentials);
      replace(updated);
      setNotice(`${integration.name} is connected.`);
    });
  }

  async function onTest(integration: Integration) {
    await run(integration.provider, async () => {
      const updated = await testIntegration(integration.provider);
      replace(updated);
      setNotice(
        updated.connection?.lastError
          ? `${integration.name} rejected the stored keys.`
          : `${integration.name} answered. The keys still work.`,
      );
    });
  }

  async function onToggleActive(integration: Integration) {
    const pausing = integration.connection?.status !== "disabled";
    await run(integration.provider, async () => {
      const updated = await setIntegrationActive(integration.provider, !pausing);
      replace(updated);
      setNotice(pausing ? `${integration.name} is paused.` : `${integration.name} is live again.`);
    });
  }

  async function onDisconnect(integration: Integration) {
    if (
      !window.confirm(
        `Disconnect ${integration.name}? The stored keys are erased and you will have to enter them again.`,
      )
    ) {
      return;
    }
    await run(integration.provider, async () => {
      await disconnectIntegration(integration.provider);
      replace({ ...integration, connection: null });
      setNotice(`${integration.name} disconnected.`);
    });
  }

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <div>
        <h1 className="page-title">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect your own accounts to this workspace. Each workspace keeps its own keys, so what you
          connect here is used only for your customers.
        </p>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}

      <div className="mt-5">
        <input
          className="input"
          placeholder="Search integrations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip label="All" active={category === "all"} onClick={() => setCategory("all")} />
        {categories.map((value) => (
          <FilterChip
            key={value}
            label={INTEGRATION_CATEGORY_LABELS[value] ?? value}
            active={category === value}
            onClick={() => setCategory(value)}
          />
        ))}
      </div>

      <p className="mt-4 text-sm text-slate-500">
        {connectedCount} of {integrations.length} connected
      </p>

      <section className="mt-3 grid gap-4 lg:grid-cols-2">
        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">No integrations match “{search}”.</p>
        ) : (
          visible.map((integration) => (
            <IntegrationCard
              key={integration.provider}
              integration={integration}
              canManage={canManage}
              busy={busyProvider === integration.provider}
              onConnect={(credentials) => void onConnect(integration, credentials)}
              onTest={() => void onTest(integration)}
              onToggleActive={() => void onToggleActive(integration)}
              onDisconnect={() => void onDisconnect(integration)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-brand-800 bg-brand-800 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
