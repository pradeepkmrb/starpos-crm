"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  type MetaLeadConnection,
  connectIntegration,
  disconnectIntegration,
  getAccessToken,
  getMetaLeadConnection,
  listIntegrations,
  me,
  setIntegrationActive,
  testIntegration,
} from "../../../lib/api";
import { IntegrationCard } from "./IntegrationCard";
import { FacebookGlyph } from "./meta-lead-ads/ConnectMetaButton";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { PageHeader } from "../../../components/ui";
import { PlugIcon as PlugHeaderIcon } from "../../../components/icons";

export default function IntegrationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<IntegrationCategory | "lead_sources" | "all">("all");
  const [metaLeads, setMetaLeads] = useState<MetaLeadConnection | null>(null);
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
        // Admin-only endpoint; everyone else just sees the card unconnected.
        if (roleAtLeast(meRes.role, "admin")) {
          setMetaLeads((await getMetaLeadConnection().catch(() => ({ connection: null }))).connection);
        }
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

  const showMetaLeads =
    (category === "all" || category === "lead_sources") &&
    (!search.trim() || META_LEADS_SEARCH.includes(search.trim().toLowerCase()));

  const connectedCount =
    integrations.filter((i) => i.connection?.status === "connected").length + (metaLeads ? 1 : 0);

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
      <PageHeader
        icon={PlugHeaderIcon}
        tone="sky"
        title="Integrations"
        subtitle="Connect your own accounts. Each workspace keeps its own keys, used only for your customers."
      />

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
        <FilterChip
          label="Lead sources"
          active={category === "lead_sources"}
          onClick={() => setCategory("lead_sources")}
        />
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
        {connectedCount} of {integrations.length + 1} connected
      </p>

      <section className="mt-3 grid gap-4 lg:grid-cols-2">
        {showMetaLeads && <MetaLeadAdsCard connection={metaLeads} canManage={canManage} />}
        {category === "lead_sources" ? null : visible.length === 0 && !showMetaLeads ? (
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

const META_LEADS_SEARCH = "meta lead ads facebook instagram forms lead sources";

/** Meta lead ads connect by Facebook login rather than pasted keys, so they get their own card. */
function MetaLeadAdsCard({ connection, canManage }: { connection: MetaLeadConnection | null; canManage: boolean }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1877F2] text-white">
          <FacebookGlyph className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Meta lead ads</h3>
            {connection && <span className="badge badge-success">Connected</span>}
          </div>
          <p className="text-sm text-slate-500">Lead sources</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Log in with Facebook and every instant-form lead ad on your Pages sends its submissions straight to Leads,
        mapped onto your own fields.
      </p>
      {connection && (
        <p className="mt-3 text-sm text-slate-500">
          {connection.fbUserName ?? "Facebook account"} · {connection.pages.length} Page
          {connection.pages.length === 1 ? "" : "s"}
        </p>
      )}
      <div className="mt-4">
        {canManage ? (
          <Link
            href="/dashboard/integrations/meta-lead-ads"
            className={connection ? "btn-secondary" : "btn-primary"}
          >
            {connection ? "Manage forms and mapping" : "Connect with Facebook"}
          </Link>
        ) : (
          <p className="text-sm text-slate-500">Ask an admin or owner to connect Meta lead ads.</p>
        )}
      </div>
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
