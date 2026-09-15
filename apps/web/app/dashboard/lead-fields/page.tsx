"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LEAD_FIELD_TYPES,
  isChoiceFieldType,
  roleAtLeast,
  type LeadFieldType,
  type TenantRole,
} from "@digitel/shared";
import {
  ApiError,
  type LeadFieldDefinition,
  createLeadField,
  deleteLeadField,
  getAccessToken,
  listLeadFields,
  me,
  reorderLeadFields,
  updateLeadField,
} from "../../../lib/api";

/** Plain-language names for the input kinds, since "dropdown" beats "select". */
const TYPE_LABELS: Record<LeadFieldType, string> = {
  text: "Text box",
  textarea: "Paragraph",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  radio: "Radio buttons",
  checkbox: "Tick box",
};

export default function LeadFieldsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("");
  const [type, setType] = useState<LeadFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  const [helpText, setHelpText] = useState("");

  const canManage = role ? roleAtLeast(role, "admin") : false;
  const needsOptions = isChoiceFieldType(type);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, fieldsRes] = await Promise.all([me(), listLeadFields()]);
        setRole(meRes.role);
        setFields(fieldsRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load lead fields");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function parseOptions(): string[] {
    return optionsText
      .split(/[\n,]/)
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createLeadField({
        label: label.trim(),
        type,
        options: needsOptions ? parseOptions() : undefined,
        required,
        placeholder: placeholder.trim() || undefined,
        helpText: helpText.trim() || undefined,
      });
      setFields((prev) => [...prev, created]);
      setNotice(`Added “${created.label}” to the lead entry screen.`);
      setLabel("");
      setOptionsText("");
      setRequired(false);
      setPlaceholder("");
      setHelpText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add this field");
    } finally {
      setBusy(false);
    }
  }

  async function patch(field: LeadFieldDefinition, input: Parameters<typeof updateLeadField>[1]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateLeadField(field.id, input);
      setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this field");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(field: LeadFieldDefinition) {
    if (
      !window.confirm(
        `Delete “${field.label}”? It disappears from the entry screen. Answers already saved on leads are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteLeadField(field.id);
      setFields((prev) => prev.filter((f) => f.id !== field.id));
      setNotice(`Deleted “${field.label}”.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this field");
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const reordered = [...fields];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setFields(reordered);
    setBusy(true);
    try {
      const saved = await reorderLeadFields(reordered.map((field) => field.id));
      setFields(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the new order");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading lead fields…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Lead fields</h1>
          <p className="mt-1 text-sm text-slate-500">
            Anything you add here shows up on the lead entry screen, in this order, for everyone in the
            workspace.
          </p>
        </div>
        <Link href="/dashboard/leads" className="btn-secondary">
          Back to leads
        </Link>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}

      {!canManage && (
        <p className="mt-4 text-sm text-slate-500">
          Only an admin or owner can change the shape of the lead form.
        </p>
      )}

      {canManage && (
        <form className="card mt-5 space-y-4 p-5" onSubmit={onCreate}>
          <h2 className="text-lg font-semibold text-slate-900">Add a field</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="field-label">
                Label <span className="text-red-500">*</span>
              </label>
              <input
                id="field-label"
                className="input"
                required
                placeholder="Preferred city"
                value={label}
                disabled={busy}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="field-type">
                Input type
              </label>
              <select
                id="field-type"
                className="input"
                value={type}
                disabled={busy}
                onChange={(e) => setType(e.target.value as LeadFieldType)}
              >
                {LEAD_FIELD_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="field-placeholder">
                Placeholder
              </label>
              <input
                id="field-placeholder"
                className="input"
                value={placeholder}
                disabled={busy}
                onChange={(e) => setPlaceholder(e.target.value)}
              />
            </div>

            {needsOptions && (
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="field-label" htmlFor="field-options">
                  Choices <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="field-options"
                  className="input min-h-[72px]"
                  placeholder={"Chennai\nMadurai\nCoimbatore"}
                  value={optionsText}
                  disabled={busy}
                  onChange={(e) => setOptionsText(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">One per line, or separated by commas.</p>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="field-label" htmlFor="field-help">
                Helper text
              </label>
              <input
                id="field-help"
                className="input"
                placeholder="Shown in small print under the field"
                value={helpText}
                disabled={busy}
                onChange={(e) => setHelpText(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={required}
              disabled={busy}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Required when someone adds a lead by hand
          </label>
          <p className="text-xs text-slate-500">
            Leads arriving from a Meta ad are never rejected for a missing required answer — a real
            enquiry is worth more than a complete form. A required tick box has to be ticked, which is
            what consent fields are for.
          </p>

          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !label.trim() || (needsOptions && parseOptions().length === 0)}
          >
            Add field
          </button>
        </form>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Your fields</h2>
        {fields.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No custom fields yet. The lead entry screen still has name, number, email, company, stage,
            owner, value, source and notes.
          </p>
        ) : (
          <div className="card mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Label</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Choices</th>
                  <th className="px-4 py-3 font-semibold">Required</th>
                  <th className="px-4 py-3 font-semibold">On the form</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fields.map((field, index) => (
                  <tr key={field.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-2 text-slate-500 disabled:opacity-40"
                          disabled={!canManage || busy || index === 0}
                          aria-label={`Move ${field.label} up`}
                          onClick={() => void move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-2 text-slate-500 disabled:opacity-40"
                          disabled={!canManage || busy || index === fields.length - 1}
                          aria-label={`Move ${field.label} down`}
                          onClick={() => void move(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{field.label}</p>
                      <p className="text-xs text-slate-500">{field.key}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[field.type]}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {field.optionsJson?.length ? field.optionsJson.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={field.required}
                          disabled={!canManage || busy}
                          onChange={(e) => void patch(field, { required: e.target.checked })}
                        />
                        {field.required ? "Required" : "Optional"}
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={field.isActive}
                          disabled={!canManage || busy}
                          onChange={(e) => void patch(field, { isActive: e.target.checked })}
                        />
                        {field.isActive ? "Shown" : "Hidden"}
                      </label>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="btn-danger"
                            disabled={busy}
                            onClick={() => void onDelete(field)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Hiding a field takes it off the entry screen but keeps every answer already recorded. Deleting
          it removes the question only — stored answers stay on the leads that have them.
        </p>
      </section>
    </div>
  );
}
