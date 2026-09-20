"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  isChoiceFieldType,
  roleAtLeast,
  type CustomFieldEntity,
  type CustomFieldType,
  type TenantRole,
} from "@digitel/shared";
import {
  ApiError,
  type CustomFieldDefinition,
  createCustomField,
  deleteCustomField,
  getAccessToken,
  listCustomFields,
  me,
  reorderCustomFields,
  updateCustomField,
} from "../lib/api";
import { PageHeader } from "./ui";
import { SlidersIcon as SlidersHeaderIcon } from "./icons";

/** What changes between the two builders is wording, not behaviour. */
const COPY: Record<
  CustomFieldEntity,
  { title: string; intro: string; backHref: string; backLabel: string; requiredNote: string; fixedFields: string }
> = {
  lead: {
    title: "Lead fields",
    intro:
      "Anything you add here shows up on the lead entry screen, in this order, for everyone in the workspace.",
    backHref: "/dashboard/leads",
    backLabel: "Back to leads",
    requiredNote:
      "Leads arriving from a Meta ad are never rejected for a missing required answer — a real enquiry is worth more than a complete form.",
    fixedFields:
      "The lead entry screen still has name, number, email, company, stage, owner, value, source and notes.",
  },
  contact: {
    title: "Contact fields",
    intro:
      "Anything you add here shows up when someone adds or edits a contact, in this order, for everyone in the workspace.",
    backHref: "/dashboard/contacts",
    backLabel: "Back to audience",
    requiredNote:
      "Contacts created by an incoming WhatsApp message or a CSV import are never rejected for a missing required answer — the answers can be filled in afterwards.",
    fixedFields: "A contact still has its number, name, email, language and marketing opt-in.",
  },
};

/**
 * The field builder. One component serves both menus: the entity decides
 * which set of fields is edited and which entry screen the wording points at.
 */
export function CustomFieldsManager({ entity }: { entity: CustomFieldEntity }) {
  const router = useRouter();
  const copy = COPY[entity];
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
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
    setLoading(true);
    (async () => {
      try {
        const [meRes, fieldsRes] = await Promise.all([me(), listCustomFields(entity)]);
        setRole(meRes.role);
        setFields(fieldsRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load fields");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, entity]);

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
      const created = await createCustomField(entity, {
        label: label.trim(),
        type,
        options: needsOptions ? parseOptions() : undefined,
        required,
        placeholder: placeholder.trim() || undefined,
        helpText: helpText.trim() || undefined,
      });
      setFields((prev) => [...prev, created]);
      setNotice(`Added “${created.label}”. It is on the form now.`);
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

  async function patch(field: CustomFieldDefinition, input: Parameters<typeof updateCustomField>[2]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCustomField(entity, field.id, input);
      setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this field");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(field: CustomFieldDefinition) {
    if (
      !window.confirm(
        `Delete “${field.label}”? It disappears from the form. Answers already saved are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteCustomField(entity, field.id);
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
      const saved = await reorderCustomFields(
        entity,
        reordered.map((field) => field.id),
      );
      setFields(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the new order");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="skeleton h-64 rounded-2xl" />;

  return (
    <div>
      <PageHeader
        icon={SlidersHeaderIcon}
        tone="slate"
        title={copy.title}
        subtitle={copy.intro}
        actions={
          <Link href={copy.backHref} className="btn-secondary">
            {copy.backLabel}
          </Link>
        }
      />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}

      {!canManage && (
        <p className="mt-4 text-sm text-slate-500">
          Only an admin or owner can change the shape of this form.
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
                onChange={(e) => setType(e.target.value as CustomFieldType)}
              >
                {CUSTOM_FIELD_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {CUSTOM_FIELD_TYPE_LABELS[value]}
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
            Required when someone fills this form in by hand
          </label>
          <p className="text-xs text-slate-500">
            {copy.requiredNote} A required tick box has to be ticked, which is what consent fields are
            for.
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
          <p className="mt-2 text-sm text-slate-500">No custom fields yet. {copy.fixedFields}</p>
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
                    <td className="px-4 py-3 text-slate-600">{CUSTOM_FIELD_TYPE_LABELS[field.type]}</td>
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
          Hiding a field takes it off the form but keeps every answer already recorded. Deleting it
          removes the question only — stored answers stay on the records that have them.
        </p>
      </section>
    </div>
  );
}
