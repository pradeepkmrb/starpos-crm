"use client";

import { useEffect, useState } from "react";
import { CUSTOM_TARGET_PREFIX, IGNORE_TARGET, LEAD_STANDARD_TARGETS } from "@starpos-crm/shared";
import type { CustomFieldDefinition, MetaFormQuestion } from "../../../../lib/api";

const AUTO = "";

const STANDARD_LABELS: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  company: "Company",
  notes: "Notes",
};

/** A target value as the person reads it, for "Default: …" hints. */
export function describeTarget(target: string | undefined, fields: CustomFieldDefinition[]): string | null {
  if (!target) return null;
  if (target === IGNORE_TARGET) return "Ignored";
  if (target.startsWith(CUSTOM_TARGET_PREFIX)) {
    const key = target.slice(CUSTOM_TARGET_PREFIX.length);
    return fields.find((field) => field.key === key)?.label ?? key;
  }
  return STANDARD_LABELS[target] ?? target;
}

/**
 * Decides where each question on a Meta form lands on a lead. Leaving a row
 * on the automatic choice is the common case: the API already recognises
 * Meta's standard question names and any question whose name matches one of
 * your own field keys.
 *
 * `inherited` is the connection-wide mapping when editing one form, so a row
 * left on automatic can say what it will actually do.
 */
export function FieldMappingEditor({
  questions,
  fields,
  mapping,
  inherited,
  busy,
  saveLabel = "Save mapping",
  onSave,
  onCancel,
}: {
  questions: MetaFormQuestion[];
  fields: CustomFieldDefinition[];
  mapping: Record<string, string>;
  inherited?: Record<string, string>;
  busy: boolean;
  saveLabel?: string;
  onSave: (mapping: Record<string, string>) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(mapping);
  const [manualQuestion, setManualQuestion] = useState("");

  useEffect(() => setDraft(mapping), [mapping]);

  // Meta's questions plus anything already mapped, so a saved row stays
  // visible even when the form can't be read right now.
  const rows = Array.from(
    new Set([...questions.map((question) => question.key), ...Object.keys(draft)]),
  );
  const labelFor = new Map(questions.map((question) => [question.key, question.label]));
  const activeFields = fields.filter((field) => field.isActive);

  function set(question: string, target: string) {
    setDraft((prev) => {
      const next = { ...prev };
      if (target === AUTO) delete next[question];
      else next[question] = target;
      return next;
    });
  }

  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Meta has not returned any questions yet. Add a question name by hand below, or refresh the
          connection once your forms are published.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[1fr_16rem] gap-4 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Question on the Meta form</span>
            <span>Goes to lead field</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((question) => {
              const fromDefault = describeTarget(inherited?.[question], fields);
              return (
                <div key={question} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_16rem] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {labelFor.get(question) ?? question}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-400">{question}</p>
                  </div>
                  <select
                    className="input"
                    value={draft[question] ?? AUTO}
                    disabled={busy}
                    aria-label={`Where ${question} goes`}
                    onChange={(e) => set(question, e.target.value)}
                  >
                    <option value={AUTO}>
                      {fromDefault ? `Use default (${fromDefault})` : "Decide automatically"}
                    </option>
                    <optgroup label="Lead fields">
                      {LEAD_STANDARD_TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {STANDARD_LABELS[target] ?? target}
                        </option>
                      ))}
                    </optgroup>
                    {activeFields.length > 0 && (
                      <optgroup label="Your lead fields">
                        {activeFields.map((field) => (
                          <option key={field.id} value={`${CUSTOM_TARGET_PREFIX}${field.key}`}>
                            {field.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value={IGNORE_TARGET}>Ignore this answer</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="field-label" htmlFor="manual-question">
            Add a question by its Meta name
          </label>
          <input
            id="manual-question"
            className="input w-64"
            placeholder="which_city"
            value={manualQuestion}
            disabled={busy}
            onChange={(e) => setManualQuestion(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || !manualQuestion.trim()}
          onClick={() => {
            set(manualQuestion.trim(), IGNORE_TARGET);
            setManualQuestion("");
          }}
        >
          Add row
        </button>
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn-primary" disabled={busy} onClick={() => onSave(draft)}>
            {saveLabel}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Answers with nowhere to go are appended to the lead&rsquo;s notes rather than dropped. Need another
        field? Add it under <a href="/dashboard/lead-fields" className="font-medium text-brand-700 underline">Lead fields</a>.
      </p>
    </div>
  );
}
