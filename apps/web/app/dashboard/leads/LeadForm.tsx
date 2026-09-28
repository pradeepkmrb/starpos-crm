"use client";

import { useEffect, useMemo, useState } from "react";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@starpos-crm/shared";
import type { CustomFieldDefinition, Lead, LeadInput, Member } from "../../../lib/api";
import { CustomFieldInput, type CustomValue } from "../../../components/CustomFieldInput";

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  company: string;
  status: LeadStatus;
  source: string;
  valueRupees: string;
  ownerUserId: string;
  notes: string;
  address: string;
  /** YYYY-MM-DD, as the date input speaks it. */
  expectedClose: string;
  isHot: boolean;
  custom: Record<string, CustomValue>;
}

export function emptyFormValues(fields: CustomFieldDefinition[]): LeadFormValues {
  return {
    name: "",
    phone: "",
    email: "",
    company: "",
    status: "new",
    source: "manual",
    valueRupees: "",
    ownerUserId: "",
    notes: "",
    address: "",
    expectedClose: "",
    isHot: false,
    custom: defaultCustomValues(fields),
  };
}

/** Tick-boxes need an explicit false so an untouched one submits as "not ticked". */
function defaultCustomValues(fields: CustomFieldDefinition[]): Record<string, CustomValue> {
  const values: Record<string, CustomValue> = {};
  for (const field of fields) {
    if (field.isActive) values[field.key] = field.type === "checkbox" ? false : "";
  }
  return values;
}

export function formValuesFromLead(lead: Lead, fields: CustomFieldDefinition[]): LeadFormValues {
  const custom = defaultCustomValues(fields);
  for (const [key, value] of Object.entries(lead.customFieldsJson ?? {})) {
    custom[key] = typeof value === "boolean" ? value : String(value);
  }
  return {
    name: lead.name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    company: lead.company ?? "",
    status: lead.status,
    source: lead.source,
    valueRupees: lead.valuePaise === null ? "" : String(lead.valuePaise / 100),
    ownerUserId: lead.ownerUserId ?? "",
    notes: lead.notes ?? "",
    address: lead.address ?? "",
    expectedClose: toDateInput(lead.expectedCloseAt),
    isHot: lead.isHot,
    custom,
  };
}

/** Rupees on screen, paise on the wire — the same unit Plan and Invoice use. */
function toPaise(rupees: string): number | null {
  const trimmed = rupees.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export function toLeadInput(values: LeadFormValues): LeadInput {
  return {
    name: values.name.trim(),
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    company: values.company.trim() || null,
    status: values.status,
    source: values.source.trim() || "manual",
    valuePaise: toPaise(values.valueRupees),
    ownerUserId: values.ownerUserId || null,
    notes: values.notes.trim() || null,
    customFields: values.custom,
    address: values.address.trim() || null,
    // Local midnight, so the date doesn't shift a day for anyone east of UTC.
    expectedCloseAt: values.expectedClose ? new Date(`${values.expectedClose}T00:00:00`).toISOString() : null,
    isHot: values.isHot,
  };
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The lead entry screen: the fixed fields every workspace gets, followed by
 * whatever the workspace added under Lead Fields.
 */
export function LeadForm({
  fields,
  members,
  editing,
  busy,
  onSubmit,
  onCancel,
  bare = false,
}: {
  fields: CustomFieldDefinition[];
  members: Member[];
  editing: Lead | null;
  busy: boolean;
  onSubmit: (input: LeadInput) => void | Promise<void>;
  onCancel: () => void;
  /** Drop the card chrome and heading, for use inside a drawer that has its own. */
  bare?: boolean;
}) {
  const activeFields = useMemo(() => fields.filter((field) => field.isActive), [fields]);
  const [values, setValues] = useState<LeadFormValues>(() =>
    editing ? formValuesFromLead(editing, fields) : emptyFormValues(fields),
  );

  // Reloads the form when the operator switches from adding to editing (or
  // to a different lead) without unmounting it.
  useEffect(() => {
    setValues(editing ? formValuesFromLead(editing, fields) : emptyFormValues(fields));
  }, [editing, fields]);

  function set<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      className={bare ? "space-y-5" : "card mt-4 space-y-5 p-5"}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(toLeadInput(values));
      }}
    >
      <div className={bare ? "hidden" : ""}>
        <h2 className="text-lg font-semibold text-slate-900">
          {editing ? `Edit ${editing.name}` : "New lead"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Name is the only thing required. Everything below the line comes from your own lead fields.
        </p>
      </div>

      <div className={bare ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
        <div>
          <label className="field-label" htmlFor="lead-name">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="lead-name"
            className="input"
            required
            value={values.name}
            disabled={busy}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lead-phone">
            Mobile number
          </label>
          <input
            id="lead-phone"
            className="input"
            placeholder="919876543210"
            value={values.phone}
            disabled={busy}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lead-email">
            Email
          </label>
          <input
            id="lead-email"
            className="input"
            type="email"
            value={values.email}
            disabled={busy}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lead-company">
            Company
          </label>
          <input
            id="lead-company"
            className="input"
            value={values.company}
            disabled={busy}
            onChange={(e) => set("company", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lead-status">
            Stage
          </label>
          <select
            id="lead-status"
            className="input"
            value={values.status}
            disabled={busy}
            onChange={(e) => set("status", e.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="lead-owner">
            Owner
          </label>
          <select
            id="lead-owner"
            className="input"
            value={values.ownerUserId}
            disabled={busy}
            onChange={(e) => set("ownerUserId", e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name ?? member.user.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="lead-value">
            Deal value (₹)
          </label>
          <input
            id="lead-value"
            className="input"
            inputMode="decimal"
            placeholder="25000"
            value={values.valueRupees}
            disabled={busy}
            onChange={(e) => set("valueRupees", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lead-source">
            Source
          </label>
          <input
            id="lead-source"
            className="input"
            placeholder="manual, walk-in, referral…"
            value={values.source}
            disabled={busy}
            onChange={(e) => set("source", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lead-expected-close">
            Expected close
          </label>
          <input
            id="lead-expected-close"
            className="input"
            type="date"
            value={values.expectedClose}
            disabled={busy}
            onChange={(e) => set("expectedClose", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="lead-address">
            Address
          </label>
          <input
            id="lead-address"
            className="input"
            placeholder="Shop no., street, area, city"
            value={values.address}
            disabled={busy}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.isHot}
            disabled={busy}
            onChange={(e) => set("isHot", e.target.checked)}
          />
          Hot lead
        </label>
        <div className={bare ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-3"}>
          <label className="field-label" htmlFor="lead-notes">
            Notes
          </label>
          <textarea
            id="lead-notes"
            className="input min-h-[72px]"
            value={values.notes}
            disabled={busy}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>

      {activeFields.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Your lead fields
          </p>
          <div className={bare ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
            {activeFields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={values.custom[field.key]}
                disabled={busy}
                onChange={(value) =>
                  setValues((prev) => ({ ...prev, custom: { ...prev.custom, [field.key]: value } }))
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy || !values.name.trim()}>
          {editing ? "Save changes" : "Save lead"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
