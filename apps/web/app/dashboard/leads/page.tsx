"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES, roleAtLeast, type LeadStatus, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Lead,
  type LeadFieldDefinition,
  type LeadInput,
  type LeadSummary,
  type Member,
  createLead,
  deleteLead,
  getAccessToken,
  getLeadSummary,
  listLeadFields,
  listLeads,
  listMembers,
  me,
  updateLead,
} from "../../../lib/api";
import { LeadForm } from "./LeadForm";

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: "badge-neutral",
  contacted: "badge-warning",
  qualified: "badge-success",
  won: "badge-success",
  lost: "badge-danger",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function formatValue(paise: number | null): string {
  if (paise === null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function LeadsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = role ? roleAtLeast(role, "agent") : false;
  const canDelete = role ? roleAtLeast(role, "admin") : false;
  const canManageFields = role ? roleAtLeast(role, "admin") : false;

  const reload = useCallback(async () => {
    const [leadsRes, summaryRes] = await Promise.all([listLeads({ limit: 500 }), getLeadSummary()]);
    setLeads(leadsRes);
    setSummary(summaryRes);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, leadsRes, fieldsRes, summaryRes, membersRes] = await Promise.all([
          me(),
          listLeads({ limit: 500 }),
          listLeadFields(),
          getLeadSummary(),
          // A viewer can still read the roster, so this never blocks the page.
          listMembers().catch(() => [] as Member[]),
        ]);
        setRole(meRes.role);
        setLeads(leadsRes);
        setFields(fieldsRes);
        setSummary(summaryRes);
        setMembers(membersRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load leads");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const activeFields = useMemo(() => fields.filter((field) => field.isActive), [fields]);
  const fieldsByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter && lead.status !== statusFilter) return false;
      if (!q) return true;
      return [lead.name, lead.company, lead.email, lead.phone, lead.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [leads, search, statusFilter]);

  async function onSubmit(input: LeadInput) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (editing) {
        await updateLead(editing.id, input);
        setNotice(`Saved ${input.name}.`);
      } else {
        await createLead(input);
        setNotice(`Added ${input.name}.`);
      }
      await reload();
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this lead");
    } finally {
      setBusy(false);
    }
  }

  async function onStatusChange(lead: Lead, status: LeadStatus) {
    setBusy(true);
    setError(null);
    try {
      await updateLead(lead.id, { status });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not move this lead");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(lead: Lead) {
    if (!window.confirm(`Delete ${lead.name}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLead(lead.id);
      await reload();
      setNotice(`Deleted ${lead.name}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this lead");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading leads…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Capture an enquiry, track it through the pipeline, and let Meta lead ads fill this in for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen((open) => !open);
              }}
            >
              {formOpen && !editing ? "Close form" : "Add lead"}
            </button>
          )}
          {canManageFields && (
            <>
              <Link href="/dashboard/lead-fields" className="btn-secondary">
                Lead fields
              </Link>
              <Link href="/dashboard/lead-sources" className="btn-secondary">
                Meta ads
              </Link>
            </>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}

      {summary && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="All leads" value={summary.total} active={statusFilter === ""} onClick={() => setStatusFilter("")} />
          {LEAD_STATUSES.map((status) => (
            <StatTile
              key={status}
              label={status}
              value={summary.byStatus[status] ?? 0}
              active={statusFilter === status}
              onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
            />
          ))}
        </div>
      )}

      {(formOpen || editing) && canEdit && (
        <LeadForm
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
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          {visible.length} of {leads.length} shown
        </span>
        <input
          className="input w-72"
          placeholder="Search name, company, email or number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <section className="mt-3">
        {leads.length === 0 ? (
          <p className="text-sm text-slate-500">
            No leads yet — add one with <span className="font-medium">Add lead</span>, or link a Meta lead
            ad form so submissions land here on their own.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">No leads match this filter.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Value</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Added</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((lead) => {
                  const answers = Object.entries(lead.customFieldsJson ?? {});
                  const isOpen = expanded === lead.id;
                  return (
                    <Fragment key={lead.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => setExpanded(isOpen ? null : lead.id)}
                          >
                            {lead.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="whitespace-nowrap">{lead.phone || "—"}</div>
                          <div className="text-xs text-slate-500">{lead.email || ""}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{lead.company || "—"}</td>
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <select
                              className="input w-32 capitalize"
                              value={lead.status}
                              disabled={busy}
                              aria-label={`Stage for ${lead.name}`}
                              onChange={(e) => void onStatusChange(lead, e.target.value as LeadStatus)}
                            >
                              {LEAD_STATUSES.map((status) => (
                                <option key={status} value={status} className="capitalize">
                                  {status}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`badge ${STATUS_BADGE[lead.status]} capitalize`}>
                              {lead.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {lead.owner ? lead.owner.name ?? lead.owner.email : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                          {formatValue(lead.valuePaise)}
                        </td>
                        <td className="px-4 py-3">
                          {lead.source === "meta_ads" ? (
                            <span className="badge badge-success">Meta ad</span>
                          ) : (
                            <span className="text-slate-600">{lead.source}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                          {formatDate(lead.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {canEdit && (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() => {
                                  setEditing(lead);
                                  setFormOpen(true);
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="btn-danger"
                                disabled={busy}
                                onClick={() => void onDelete(lead)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50">
                          <td colSpan={9} className="px-4 py-3">
                            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {answers.length === 0 && !lead.notes && (
                                <p className="text-sm text-slate-500">
                                  Nothing else recorded for this lead.
                                </p>
                              )}
                              {answers.map(([key, value]) => (
                                <div key={key}>
                                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                                    {fieldsByKey.get(key)?.label ?? key}
                                  </dt>
                                  <dd className="text-sm text-slate-800">
                                    {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                                  </dd>
                                </div>
                              ))}
                              {lead.notes && (
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <dt className="text-xs uppercase tracking-wide text-slate-500">Notes</dt>
                                  <dd className="whitespace-pre-line text-sm text-slate-800">{lead.notes}</dd>
                                </div>
                              )}
                              {lead.metaFormLink && (
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                                    Meta lead ad
                                  </dt>
                                  <dd className="text-sm text-slate-800">
                                    {lead.metaFormLink.formName ?? lead.metaFormLink.formId}
                                    {lead.metaFormLink.pageName ? ` · ${lead.metaFormLink.pageName}` : ""}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManageFields && activeFields.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Want more than the fixed fields? Add your own text boxes, dropdowns and radio buttons under{" "}
          <Link href="/dashboard/lead-fields" className="font-medium text-brand-800 underline">
            Lead fields
          </Link>
          — they appear on this form straight away.
        </p>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card card-hover px-4 py-3 text-left ${active ? "ring-2 ring-brand-500/40" : ""}`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500 capitalize">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </button>
  );
}
