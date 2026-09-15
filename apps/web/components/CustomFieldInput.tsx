"use client";

import type { CustomFieldDefinition } from "../lib/api";

export type CustomValue = string | boolean;

/**
 * Renders one tenant-defined field on an entry screen. Everything is
 * held as a string except tick-boxes; the API coerces numbers and dates and
 * is the one place that decides whether an answer is acceptable.
 */
export function CustomFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CustomFieldDefinition;
  value: CustomValue | undefined;
  onChange: (value: CustomValue) => void;
  disabled?: boolean;
}) {
  const text = typeof value === "string" ? value : "";
  const options = field.optionsJson ?? [];
  const inputId = `custom-${field.key}`;

  if (field.type === "checkbox") {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            id={inputId}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            {field.label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </span>
        </label>
        {field.helpText && <p className="mt-1 text-xs text-slate-500">{field.helpText}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="field-label" htmlFor={field.type === "radio" ? undefined : inputId}>
        {field.label}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </label>

      {field.type === "textarea" && (
        <textarea
          id={inputId}
          className="input min-h-[80px]"
          placeholder={field.placeholder ?? ""}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {(field.type === "text" || field.type === "number" || field.type === "date") && (
        <input
          id={inputId}
          className="input"
          type={field.type === "text" ? "text" : field.type}
          placeholder={field.placeholder ?? ""}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "dropdown" && (
        <select
          id={inputId}
          className="input"
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{field.placeholder || "Select…"}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {field.type === "radio" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="radio"
                name={inputId}
                value={option}
                checked={text === option}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
          {/* Radios have no natural empty state, so clearing needs its own control. */}
          {text && !disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs font-medium text-slate-500 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {field.helpText && <p className="mt-1 text-xs text-slate-500">{field.helpText}</p>}
    </div>
  );
}
