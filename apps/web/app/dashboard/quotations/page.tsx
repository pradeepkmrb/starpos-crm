"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, formatInr, type QuotationStatus } from "@starpos-crm/shared";
import {
  ApiError,
  type BusinessProfile,
  type Quotation,
  getAccessToken,
  getBusinessProfile,
  listQuotations,
  saveBusinessProfile,
} from "../../../lib/api";
import { Drawer } from "../../../components/Drawer";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useToast } from "../../../components/Toaster";
import { NEW_QUOTATION_EVENT, consumeNewFlag } from "../../../components/nav";
import { PlusIcon, ReceiptIcon, SearchIcon, SlidersIcon } from "../../../components/icons";
import { QuotationBuilder } from "../../../components/sales/QuotationBuilder";
import { QuotationStatusBadge, QuotationView } from "../../../components/sales/QuotationView";
import { PaymentForm } from "../../../components/sales/PaymentForm";
import { useAccess } from "../../../components/AccessContext";

type Filter = "all" | QuotationStatus;

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Every quotation in the workspace: build, send, and follow them to a yes. */
export default function QuotationsPage() {
  const access = useAccess();
  const router = useRouter();
  const toast = useToast();
  const [quotes, setQuotes] = useState<Quotation[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [builder, setBuilder] = useState<{ editing: Quotation | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<Quotation | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const canEdit = access.canEdit("quotations");
  const isAdmin = access.seesAll && access.canEdit("quotations");

  const load = useCallback(async () => setQuotes(await listQuotations()), []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    load().catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push("/login");
        else setError(err instanceof ApiError ? err.message : "Could not load quotations");
      });
  }, [router, load]);

  // "+ New → New quotation" lands here with ?new=1, or fires an event when already here.
  useEffect(() => {
    if (consumeNewFlag()) setBuilder({ editing: null });
    const open = () => setBuilder({ editing: null });
    window.addEventListener(NEW_QUOTATION_EVENT, open);
    return () => window.removeEventListener(NEW_QUOTATION_EVENT, open);
  }, []);

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(QUOTATION_STATUSES.map((s) => [s, { count: 0, value: 0 }])) as Record<
      QuotationStatus,
      { count: number; value: number }
    >;
    for (const q of quotes ?? []) {
      byStatus[q.status].count += 1;
      byStatus[q.status].value += q.totalPaise;
    }
    const due = (quotes ?? []).filter((q) => q.status === "accepted").reduce((sum, q) => sum + q.balancePaise, 0);
    return { byStatus, due };
  }, [quotes]);

  const visible = (quotes ?? []).filter((q) => {
    if (filter !== "all" && q.status !== filter) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [q.number, q.lead.name, q.lead.company ?? ""].some((s) => s.toLowerCase().includes(needle));
  });

  const open = quotes?.find((q) => q.id === openId) ?? null;

  function upsert(q: Quotation) {
    setQuotes((all) => (all?.some((x) => x.id === q.id) ? all.map((x) => (x.id === q.id ? q : x)) : [q, ...(all ?? [])]));
  }

  if (!quotes && !error) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Quotations</h1>
          <p className="page-subtitle">GST quotes built from your catalogue, sent as a PDF on WhatsApp.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button type="button" className="btn-secondary" onClick={() => setProfileOpen(true)}>
              <SlidersIcon className="h-4 w-4" />
              Business details
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn-primary" onClick={() => setBuilder({ editing: null })}>
              <PlusIcon className="h-4 w-4" />
              New quotation
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting reply" value={formatInr(counts.byStatus.sent.value)} sub={`${counts.byStatus.sent.count} sent`} tone="sky" />
        <Stat label="Accepted" value={formatInr(counts.byStatus.accepted.value)} sub={`${counts.byStatus.accepted.count} won`} tone="brand" />
        <Stat label="Still to collect" value={formatInr(counts.due)} sub="on accepted quotes" tone="amber" />
        <Stat label="Drafts" value={String(counts.byStatus.draft.count)} sub={formatInr(counts.byStatus.draft.value)} tone="slate" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {(["all", ...QUOTATION_STATUSES] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {f === "all" ? "All" : QUOTATION_STATUS_LABELS[f]}
                <span className="ml-1.5 text-xs text-slate-400">
                  {f === "all" ? quotes?.length ?? 0 : counts.byStatus[f].count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search number or customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="icon-chip h-14 w-14 bg-brand-50 text-brand-600">
              <ReceiptIcon className="h-7 w-7" />
            </span>
            <p className="mt-4 font-bold text-slate-900">{quotes?.length ? "Nothing matches" : "No quotations yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {quotes?.length
                ? "Try another filter or search."
                : "Pick products from your catalogue, add GST and a discount, and send the PDF straight to the customer's WhatsApp."}
            </p>
            {canEdit && !quotes?.length && (
              <button type="button" className="btn-primary mt-5" onClick={() => setBuilder({ editing: null })}>
                <PlusIcon className="h-4 w-4" />
                Create your first quotation
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(q.id)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="icon-chip bg-brand-50 text-brand-600">
                    <ReceiptIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold text-slate-900">{q.lead.company ?? q.lead.name}</p>
                      <QuotationStatusBadge status={q.status} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {q.number} · {q.items.length} {q.items.length === 1 ? "item" : "items"} · {day(q.createdAt)}
                      {q.createdBy && ` · ${q.createdBy.name ?? q.createdBy.email}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-slate-900">{formatInr(q.totalPaise)}</p>
                    {q.status === "accepted" && (
                      <p className={`text-xs font-semibold ${q.balancePaise > 0 ? "text-amber-600" : "text-brand-600"}`}>
                        {q.balancePaise > 0 ? `${formatInr(q.balancePaise)} due` : "Paid"}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={!!builder}
        onClose={() => setBuilder(null)}
        title={builder?.editing ? `Edit ${builder.editing.number}` : "New quotation"}
        subtitle="Totals update as you type"
        width="max-w-3xl"
      >
        {builder && (
          <QuotationBuilder
            editing={builder.editing}
            onCancel={() => setBuilder(null)}
            onSaved={(q) => {
              upsert(q);
              setBuilder(null);
              setOpenId(q.id);
              toast(builder.editing ? `${q.number} updated` : `${q.number} created`);
            }}
          />
        )}
      </Drawer>

      <Drawer
        open={!!open && !builder && !paymentFor}
        onClose={() => setOpenId(null)}
        title={open?.number ?? ""}
        subtitle={open ? `Created by ${open.createdBy?.name ?? open.createdBy?.email ?? "—"}` : null}
      >
        {open && (
          <QuotationView
            quotation={open}
            canEdit={canEdit}
            onChanged={upsert}
            onEdit={() => setBuilder({ editing: open })}
            onDeleted={() => {
              setQuotes((all) => all?.filter((x) => x.id !== open.id) ?? null);
              setOpenId(null);
            }}
            onRecordPayment={() => setPaymentFor(open)}
          />
        )}
      </Drawer>

      <Drawer open={!!paymentFor} onClose={() => setPaymentFor(null)} title="Record payment" subtitle={paymentFor?.number}>
        {paymentFor && (
          <PaymentForm
            leadId={paymentFor.leadId}
            quotationId={paymentFor.id}
            onCancel={() => setPaymentFor(null)}
            onSaved={(p) => {
              toast(`${formatInr(p.amountPaise)} recorded`);
              setPaymentFor(null);
              void load();
            }}
          />
        )}
      </Drawer>

      <Drawer open={profileOpen} onClose={() => setProfileOpen(false)} title="Business details" subtitle="Printed on every quotation PDF">
        {profileOpen && (
          <BusinessProfileForm
            onDone={() => {
              setProfileOpen(false);
              toast("Business details saved");
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

const STAT_TONES = {
  brand: "bg-brand-50 text-brand-700",
  sky: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-700",
  slate: "bg-slate-100 text-slate-600",
};

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: keyof typeof STAT_TONES }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-slate-900">{value}</p>
      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STAT_TONES[tone]}`}>{sub}</span>
    </div>
  );
}

function BusinessProfileForm({ onDone }: { onDone: () => void }) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusinessProfile()
      .then(setProfile)
      .catch(() => setProfile({}));
  }, []);

  if (!profile) return <div className="skeleton h-64 rounded-2xl" />;

  const field = (key: keyof BusinessProfile, label: string, placeholder?: string) => (
    <div>
      <label className="field-label" htmlFor={`bp-${key}`}>
        {label}
      </label>
      <input
        id={`bp-${key}`}
        className="input"
        placeholder={placeholder}
        value={(profile[key] as string | undefined) ?? ""}
        onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
      />
    </div>
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const clean: BusinessProfile = {};
      for (const [k, v] of Object.entries(profile ?? {})) {
        if (typeof v === "string" && v.trim()) (clean as Record<string, unknown>)[k] = v.trim();
        if (typeof v === "number") (clean as Record<string, unknown>)[k] = v;
      }
      await saveBusinessProfile(clean);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {field("legalName", "Registered business name", "Shown at the top of the PDF")}
      {field("gstin", "GSTIN", "22AAAAA0000A1Z5")}
      <div>
        <label className="field-label" htmlFor="bp-address">
          Address
        </label>
        <textarea
          id="bp-address"
          className="input min-h-[72px]"
          value={profile.address ?? ""}
          onChange={(e) => setProfile({ ...profile, address: e.target.value })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("phone", "Phone")}
        {field("email", "Email")}
      </div>
      <div>
        <label className="field-label" htmlFor="bp-validity">
          Quotes valid for (days)
        </label>
        <input
          id="bp-validity"
          className="input w-32"
          inputMode="numeric"
          value={profile.validityDays ?? ""}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            setProfile({ ...profile, validityDays: Number.isFinite(n) ? n : undefined });
          }}
        />
      </div>
      <div>
        <label className="field-label" htmlFor="bp-terms">
          Terms and conditions
        </label>
        <textarea
          id="bp-terms"
          className="input min-h-[110px]"
          placeholder="Payment terms, delivery, warranty…"
          value={profile.terms ?? ""}
          onChange={(e) => setProfile({ ...profile, terms: e.target.value })}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save details"}
      </button>
    </div>
  );
}
