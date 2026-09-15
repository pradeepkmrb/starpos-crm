"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact, CustomFieldDefinition, CustomFieldValues } from "../../../lib/api";
import { CustomFieldInput, type CustomValue } from "../../../components/CustomFieldInput";

export type CustomValues = Record<string, CustomValue>;

/** Tick boxes need an explicit false so an untouched one submits as "not ticked". */
export function blankValues(fields: CustomFieldDefinition[]): CustomValues {
  const values: CustomValues = {};
  for (const field of fields) {
    if (field.isActive) values[field.key] = field.type === "checkbox" ? false : "";
  }
  return values;
}

export function valuesFromContact(contact: Contact, fields: CustomFieldDefinition[]): CustomValues {
  const values = blankValues(fields);
  for (const [key, value] of Object.entries(contact.attributesJson ?? {})) {
    values[key] = typeof value === "boolean" ? value : String(value);
  }
  return values;
}

export function toCustomFieldValues(values: CustomValues): CustomFieldValues {
  return values as CustomFieldValues;
}

/** The tenant's own contact questions, rendered wherever a contact is filled in. */
export function CustomFieldsFieldset({
  fields,
  values,
  busy,
  onChange,
}: {
  fields: CustomFieldDefinition[];
  values: CustomValues;
  busy?: boolean;
  onChange: (values: CustomValues) => void;
}) {
  const active = useMemo(() => fields.filter((field) => field.isActive), [fields]);
  if (active.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {active.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          value={values[field.key]}
          disabled={busy}
          onChange={(value) => onChange({ ...values, [field.key]: value })}
        />
      ))}
    </div>
  );
}

/**
 * The expanded row under a contact: its custom answers, editable in place so
 * an operator does not have to open the inbox to correct one.
 */
export function ContactDetailPanel({
  contact,
  fields,
  canEdit,
  onSave,
}: {
  contact: Contact;
  fields: CustomFieldDefinition[];
  canEdit: boolean;
  onSave: (values: CustomFieldValues) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<CustomValues>(() => valuesFromContact(contact, fields));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(valuesFromContact(contact, fields));
  }, [contact, fields]);

  const active = fields.filter((field) => field.isActive);
  const answers = Object.entries(contact.attributesJson ?? {});
  const labelFor = new Map(fields.map((field) => [field.key, field.label]));

  if (active.length === 0 && answers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No contact fields yet. Add your own questions under Contact Fields and they appear here.
      </p>
    );
  }

  if (!editing) {
    return (
      <div>
        {answers.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded against your contact fields yet.</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {answers.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  {labelFor.get(key) ?? key}
                </dt>
                <dd className="text-sm text-slate-800">
                  {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {canEdit && active.length > 0 && (
          <button type="button" className="btn-secondary mt-3" onClick={() => setEditing(true)}>
            Edit details
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSave(toCustomFieldValues(values));
          setEditing(false);
        } finally {
          setSaving(false);
        }
      }}
    >
      <CustomFieldsFieldset fields={fields} values={values} busy={saving} onChange={setValues} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={() => {
            setValues(valuesFromContact(contact, fields));
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
