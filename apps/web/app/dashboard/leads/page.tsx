"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@starpos-crm/shared";
import {
  ApiError,
  type Lead,
  type CustomFieldDefinition,
  type LeadInput,
  type LeadSummary,
  type Member,
  createLead,
  deleteLead,
  getAccessToken,
  getLeadSummary,
  listCustomFields,
  listLeads,
  listMembers,
  updateLead,
} from "../../../lib/api";
import { mapsLink } from "../../../lib/activities";
import { Drawer } from "../../../components/Drawer";
import { NEW_LEAD_EVENT } from "../../../components/nav";
import { useToast } from "../../../components/Toaster";
import {
  BoardIcon,
  FlameIcon,
  ListIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
} from "../../../components/icons";
import { LeadForm } from "./LeadForm";
import { LeadActivities } from "./LeadActivities";
import { LeadDeals } from "../../../components/sales/LeadDeals";
import { useAccess } from "../../../components/AccessContext";

type View = "board" | "table";
const VIEW_KEY = "starpos_crm_leads_view";

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: "badge-info",
  contacted: "badge-neutral",
  interested: "badge-warning",
  qualified: "badge-success",
  demo_scheduled: "badge-warning",
  proposal: "badge-info",
  won: "badge-success",
  lost: "badge-danger",
};

const STAGE_DOT: Record<LeadStatus, string> = {
  new: "bg-sky-400",
  contacted: "bg-indigo-400",
  interested: "bg-amber-400",
  qualified: "bg-leaf-400",
  demo_scheduled: "bg-violet-400",
  proposal: "bg-brand-400",
  won: "bg-brand-600",
  lost: "bg-slate-300",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatValue(paise: number | null): string {
  if (paise === null) return "—";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export default function LeadsPage() {
  const access = useAccess();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [hotOnly, setHotOnly] = useState(false);
  const [view, setView] = useState<View>("board");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = access.canEdit("leads");
  const canDelete = access.canEdit("leads");
  const canManageFields = access.canEdit("lead_fields");

  const reload = useCallback(async () => {
    const [leadsRes, summaryRes] = await Promise.all([listLeads({ limit: 500 }), getLeadSummary()]);
    setLeads(leadsRes);
    setSummary(summaryRes);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "board" || saved === "table") setView(saved);
    } catch {
      // storage blocked: keep the default
    }
    // "+ New → New lead" links here with ?new=1.
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setFormOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const openForm = () => {
      setEditing(null);
      setFormOpen(true);
    };
    window.addEventListener(NEW_LEAD_EVENT, openForm);
    return () => window.removeEventListener(NEW_LEAD_EVENT, openForm);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [leadsRes, fieldsRes, summaryRes, membersRes] = await Promise.all([
          listLeads({ limit: 500 }),
          listCustomFields("lead"),
          getLeadSummary(),
          listMembers().catch(() => [] as Member[]),
        ]);
        setLeads(leadsRes);
        setFields(fieldsRes);
        setSummary(summaryRes);
        setMembers(membersRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Couldn't load leads");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // not persisted
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (view === "table" && statusFilter && lead.status !== statusFilter) return false;
      if (hotOnly && !lead.isHot) return false;
      if (!q) return true;
      return [lead.name, lead.company, lead.email, lead.phone, lead.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [leads, search, statusFilter, hotOnly, view]);

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

  async function onSubmit(input: LeadInput) {
    setBusy(true);
    try {
      if (editing) {
        await updateLead(editing.id, input);
        toast(`Saved ${input.name}`);
      } else {
        const created = await createLead(input);
        toast(`Added ${input.name}`);
        setOpenLeadId(created.id);
      }
      await reload();
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save this lead", "error");
    } finally {
      setBusy(false);
    }
  }

  /** Moves a lead to another stage, updating the board straight away and undoing it if the save fails. */
  async function moveLead(lead: Lead, status: LeadStatus) {
    if (lead.status === status) return;
    const previous = lead.status;
    setLeads((all) => all.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    try {
      await updateLead(lead.id, { status });
      toast(`${lead.name} moved to ${LEAD_STATUS_LABELS[status]}`);
      await reload();
    } catch (err) {
      setLeads((all) => all.map((l) => (l.id === lead.id ? { ...l, status: previous } : l)));
      toast(err instanceof ApiError ? err.message : "Couldn't move this lead", "error");
    }
  }

  async function onDelete(lead: Lead) {
    if (!window.confirm(`Delete ${lead.name}? This can't be undone.`)) return;
    try {
      await deleteLead(lead.id);
      setOpenLeadId(null);
      await reload();
      toast(`Deleted ${lead.name}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete this lead", "error");
    }
  }

  if (loading) return <LeadsSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">
            {summary?.total ?? 0} leads in your pipeline. Drag a card to change its stage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageFields && (
            <Link href="/dashboard/lead-fields" className="btn-secondary">
              <SlidersIcon className="h-4 w-4" />
              Lead fields
            </Link>
          )}
          {canEdit && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Add lead
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Search name, company or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setHotOnly((h) => !h)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
            hotOnly ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <FlameIcon className="h-4 w-4" />
          Hot only
        </button>
        <div className="ml-auto flex rounded-xl border border-slate-200 bg-white p-1">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => chooseView(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                view === v ? "bg-brand-600 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {v === "board" ? <BoardIcon className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
              {v}
            </button>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <span className="icon-chip h-14 w-14 bg-brand-50 text-brand-600">
            <PlusIcon className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Add your first lead</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Capture an enquiry here, or link a Meta lead ad form so new leads arrive on their own.
          </p>
          <div className="mt-5 flex gap-2">
            {canEdit && (
              <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
                Add lead
              </button>
            )}
            <Link href="/dashboard/integrations/meta-lead-ads" className="btn-secondary">
              Connect Meta ads
            </Link>
          </div>
        </div>
      ) : view === "board" ? (
        <LeadsBoard leads={visible} canEdit={canEdit} onOpen={setOpenLeadId} onMove={moveLead} />
      ) : (
        <>
          {summary && (
            <div className="flex flex-wrap gap-2">
              <FilterChip label="All" count={summary.total} active={statusFilter === ""} onClick={() => setStatusFilter("")} />
              {LEAD_STATUSES.map((s) => (
                <FilterChip
                  key={s}
                  label={LEAD_STATUS_LABELS[s]}
                  dot={STAGE_DOT[s]}
                  count={summary.byStatus[s] ?? 0}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                />
              ))}
            </div>
          )}
          <LeadsTable leads={visible} onOpen={setOpenLeadId} />
        </>
      )}

      {/* Lead details */}
      <Drawer
        open={!!openLead}
        onClose={() => setOpenLeadId(null)}
        title={
          openLead && (
            <span className="flex items-center gap-2">
              {openLead.name}
              {openLead.isHot && <FlameIcon className="h-5 w-5 text-red-500" />}
            </span>
          )
        }
        subtitle={openLead?.company}
        actions={
          openLead &&
          canEdit && (
            <button
              type="button"
              className="btn-secondary px-3 py-2"
              onClick={() => {
                setEditing(openLead);
                setFormOpen(true);
              }}
            >
              Edit
            </button>
          )
        }
      >
        {openLead && (
          <LeadPanel
            lead={openLead}
            fields={fields}
            canEdit={canEdit}
            canDelete={canDelete}
            onMove={(s) => void moveLead(openLead, s)}
            onDelete={() => void onDelete(openLead)}
            onChanged={() => void reload()}
          />
        )}
      </Drawer>

      {/* Add / edit */}
      <Drawer
        open={formOpen && canEdit}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? `Edit ${editing.name}` : "New lead"}
        subtitle="Name is the only required field."
        width="max-w-2xl"
      >
        <LeadForm
          bare
          fields={fields}
          members={members}
          editing={editing}
          busy={busy}
          onSubmit={onSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      </Drawer>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  dot,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {dot && <span className={`h-2 w-2 rounded-full ${active ? "bg-white" : dot}`} />}
      {label}
      <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{count}</span>
    </button>
  );
}

function LeadsBoard({
  leads,
  canEdit,
  onOpen,
  onMove,
}: {
  leads: Lead[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  onMove: (lead: Lead, status: LeadStatus) => void;
}) {
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);
  const byStage = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>(LEAD_STATUSES.map((s) => [s, []]));
    for (const lead of leads) map.get(lead.status)?.push(lead);
    return map;
  }, [leads]);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
      <div className="flex gap-4" style={{ minWidth: `${LEAD_STATUSES.length * 288}px` }}>
        {LEAD_STATUSES.map((status) => {
          const column = byStage.get(status) ?? [];
          const total = column.reduce((sum, l) => sum + (l.valuePaise ?? 0), 0);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const lead = leads.find((l) => l.id === e.dataTransfer.getData("text/lead-id"));
                if (lead) onMove(lead, status);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl p-2 transition-colors ${
                dragOver === status ? "bg-brand-50 ring-2 ring-brand-400" : "bg-slate-100/80"
              }`}
            >
              <div className="flex items-center gap-2 px-2 pb-3 pt-1">
                <span className={`h-2.5 w-2.5 rounded-full ${STAGE_DOT[status]}`} />
                <span className="text-sm font-bold text-slate-800">{LEAD_STATUS_LABELS[status]}</span>
                <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-500">{column.length}</span>
                {total > 0 && <span className="ml-auto text-xs font-semibold text-slate-500">{formatValue(total)}</span>}
              </div>
              <div className="flex min-h-24 flex-col gap-2">
                {column.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    draggable={canEdit}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/lead-id", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onOpen(lead.id)}
                    className="card card-hover cursor-pointer p-3.5 text-left active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{lead.company || lead.name}</p>
                        {lead.company && <p className="truncate text-xs text-slate-500">{lead.name}</p>}
                      </div>
                      {lead.isHot && (
                        <span className="rounded-lg bg-red-50 p-1 text-red-500" title="Hot lead">
                          <FlameIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {lead.valuePaise !== null && (
                        <span className="text-sm font-bold text-slate-800">{formatValue(lead.valuePaise)}</span>
                      )}
                      {lead.phone && <PhoneIcon className="h-3.5 w-3.5 text-slate-400" />}
                      {lead.latitude !== null && <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />}
                      <span className="ml-auto flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">{formatDate(lead.createdAt)}</span>
                        {lead.owner && (
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-800"
                            title={lead.owner.name ?? lead.owner.email}
                          >
                            {initials(lead.owner.name ?? lead.owner.email)}
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                ))}
                {column.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                    {canEdit ? "Drop a lead here" : "No leads"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadsTable({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  if (leads.length === 0) return <p className="text-sm text-slate-500">No leads match this filter.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
            <th className="px-5 py-3.5">Lead</th>
            <th className="px-5 py-3.5">Stage</th>
            <th className="px-5 py-3.5">Value</th>
            <th className="px-5 py-3.5">Owner</th>
            <th className="px-5 py-3.5">Source</th>
            <th className="px-5 py-3.5">Added</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id} onClick={() => onOpen(lead.id)} className="cursor-pointer transition-colors hover:bg-brand-50/40">
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">
                    {initials(lead.company || lead.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-slate-900">
                      {lead.name}
                      {lead.isHot && <FlameIcon className="h-4 w-4 text-red-500" />}
                    </p>
                    <p className="truncate text-xs text-slate-500">{[lead.company, lead.phone].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span className={`badge ${STATUS_BADGE[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span>
              </td>
              <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-slate-800">{formatValue(lead.valuePaise)}</td>
              <td className="px-5 py-3.5 text-slate-600">{lead.owner ? (lead.owner.name ?? lead.owner.email) : "—"}</td>
              <td className="px-5 py-3.5">
                {lead.source === "meta_ads" ? (
                  <span className="badge badge-info">Meta ad</span>
                ) : (
                  <span className="text-slate-600">{lead.source}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">{formatDate(lead.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Everything about one lead: stage, contact details, custom answers, and the activity timeline. */
function LeadPanel({
  lead,
  fields,
  canEdit,
  canDelete,
  onMove,
  onDelete,
  onChanged,
}: {
  lead: Lead;
  fields: CustomFieldDefinition[];
  canEdit: boolean;
  canDelete: boolean;
  onMove: (status: LeadStatus) => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const answers = Object.entries(lead.customFieldsJson ?? {}).filter(([, v]) => v !== "" && v !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="btn-secondary px-3 py-2">
            <PhoneIcon className="h-4 w-4" />
            Call
          </a>
        )}
        {lead.phone && (
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary px-3 py-2"
          >
            WhatsApp
          </a>
        )}
        {lead.latitude !== null && lead.longitude !== null && (
          <a href={mapsLink(lead.latitude, lead.longitude)} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-2">
            <MapPinIcon className="h-4 w-4" />
            Map
          </a>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Stage</p>
        <div className="flex flex-wrap gap-1.5">
          {LEAD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!canEdit}
              onClick={() => onMove(s)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                lead.status === s
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 disabled:hover:border-slate-200"
              }`}
            >
              {LEAD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-slate-50 p-4">
        <Detail label="Mobile" value={lead.phone} />
        <Detail label="Email" value={lead.email} />
        <Detail label="Deal value" value={lead.valuePaise !== null ? formatValue(lead.valuePaise) : null} />
        <Detail
          label="Expected close"
          value={lead.expectedCloseAt ? new Date(lead.expectedCloseAt).toLocaleDateString("en-IN") : null}
        />
        <Detail label="Owner" value={lead.owner ? (lead.owner.name ?? lead.owner.email) : "Unassigned"} />
        <Detail label="Source" value={lead.source === "meta_ads" ? "Meta ad" : lead.source} />
        {lead.address && <Detail label="Address" value={lead.address} wide />}
        {answers.map(([key, value]) => (
          <Detail
            key={key}
            label={labelFor(key)}
            value={typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
          />
        ))}
        {lead.notes && <Detail label="Notes" value={lead.notes} wide />}
      </dl>

      <LeadDeals leadId={lead.id} canEdit={canEdit} onLeadChanged={onChanged} />

      <LeadActivities leadId={lead.id} canEdit={canEdit} onLeadChanged={onChanged} />

      {canDelete && (
        <div className="border-t border-slate-100 pt-4">
          <button type="button" className="btn-danger" onClick={onDelete}>
            Delete lead
          </button>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-xs font-semibold text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm font-medium text-slate-800">{value || "—"}</dd>
    </div>
  );
}

function LeadsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-12 w-64" />
      <div className="skeleton h-11 w-full max-w-md" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-96 w-72 shrink-0" />
        ))}
      </div>
    </div>
  );
}
