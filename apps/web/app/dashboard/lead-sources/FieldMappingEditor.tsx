"use client";

import { useEffect, useState } from "react";
import { CUSTOM_TARGET_PREFIX, IGNORE_TARGET, LEAD_STANDARD_TARGETS } from "@digitel/shared";
import type { LeadFieldDefinition, MetaFormQuestion } from "../../../lib/api";

const AUTO = "";

/**
 * Decides where each question on a Meta form lands on a lead. Leaving a row
 * on "Decide automatically" is the common case: the API already recognises
 * Meta's standard question names and any question whose name matches one of
 * your own field keys.
 */
export function FieldMappingEditor({
  questions,
  fields,
  mapping,
  busy,
  onSave,
}: {
  questions: MetaFormQuestion[];
  fields: LeadFieldDefinition[];
  mapping: Record<string, string>;
  busy: boolean;
  onSave: (mapping: Record<string, string>) => void;
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
    <div className="mt-4 border-t border-slate-200 pt-4">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Meta has not returned this form&rsquo;s questions. Add a question name by hand below, or check
          that the Page token still has the leads_retrieval permission.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((question) => (
            <div key={question} className="flex flex-wrap items-center gap-3">
              <div className="min-w-[200px] flex-1">
                <p className="text-sm font-medium text-slate-800">{labelFor.get(question) ?? question}</p>
                <p className="text-xs text-slate-500">{question}</p>
              </div>
              <select
                className="input w-64"
                value={draft[question] ?? AUTO}
                disabled={busy}
                aria-label={`Where ${question} goes`}
                onChange={(e) => set(question, e.target.value)}
              >
                <option value={AUTO}>Decide automatically</option>
                {LEAD_STANDARD_TARGETS.map((target) => (
                  <option key={target} value={target} className="capitalize">
                    {target}
                  </option>
                ))}
                {activeFields.map((field) => (
                  <option key={field.id} value={`${CUSTOM_TARGET_PREFIX}${field.key}`}>
                    {field.label} (your field)
                  </option>
                ))}
                <option value={IGNORE_TARGET}>Ignore this answer</option>
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="field-label" htmlFor="manual-question">
            Add a question name by hand
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
        <button type="button" className="btn-primary" disabled={busy} onClick={() => onSave(draft)}>
          Save mapping
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Answers with nowhere to go are appended to the lead&rsquo;s notes rather than dropped.
      </p>
    </div>
  );
}
