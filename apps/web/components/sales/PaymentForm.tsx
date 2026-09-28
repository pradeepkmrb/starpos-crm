"use client";

import { useEffect, useState } from "react";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS, formatInr, type PaymentMode } from "@starpos-crm/shared";
import {
  ApiError,
  type Lead,
  type Payment,
  type Quotation,
  createPayment,
  listLeads,
  listQuotations,
} from "../../lib/api";
import { paiseToInput, rupeesToPaise, todayInput } from "../../lib/money";

/**
 * Records money received (mockup screen 14): who paid, how much, how, and
 * optionally against which accepted quotation — whose balance it pre-fills.
 */
export function PaymentForm({
  leadId: fixedLeadId,
  quotationId: fixedQuotationId,
  onSaved,
  onCancel,
}: {
  leadId?: string;
  quotationId?: string;
  onSaved: (p: Payment) => void;
  onCancel: () => void;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState(fixedLeadId ?? "");
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [quotationId, setQuotationId] = useState(fixedQuotationId ?? "");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("upi");
  const [reference, setReference] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixedLeadId) return;
    listLeads({ limit: 500 })
      .then((all) => setLeads(all.filter((l) => l.status !== "lost")))
      .catch(() => setLeads([]));
  }, [fixedLeadId]);

  // Accepted quotes of the chosen lead, so the payment can settle one of them.
  useEffect(() => {
    if (!leadId) {
      setQuotes([]);
      return;
    }
    listQuotations({ leadId, status: "accepted" })
      .then((qs) => {
        setQuotes(qs);
        const preset = qs.find((q) => q.id === (fixedQuotationId ?? "")) ?? (qs.length === 1 ? qs[0] : undefined);
        if (preset) {
          setQuotationId(preset.id);
          if (preset.balancePaise > 0) setAmount((a) => a || paiseToInput(preset.balancePaise));
        }
      })
      .catch(() => setQuotes([]));
  }, [leadId, fixedQuotationId]);

  const quote = quotes.find((q) => q.id === quotationId);

  async function save() {
    const amountPaise = rupeesToPaise(amount);
    if (!leadId) return setError("Choose who paid.");
    if (!amountPaise) return setError("Enter the amount received.");
    setBusy(true);
    setError(null);
    try {
      const payment = await createPayment({
        leadId,
        ...(quotationId ? { quotationId } : {}),
        amountPaise,
        mode,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        // Noon local time keeps the date the same in any time zone the server reads it in.
        receivedAt: new Date(`${receivedOn}T12:00:00`).toISOString(),
      });
      onSaved(payment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!fixedLeadId && (
        <div>
          <label className="field-label" htmlFor="pay-lead">
            Received from <span className="text-red-500">*</span>
          </label>
          <select
            id="pay-lead"
            className="input"
            value={leadId}
            onChange={(e) => {
              setLeadId(e.target.value);
              setQuotationId("");
            }}
          >
            <option value="">Choose a lead…</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.company ? `${l.company} — ${l.name}` : l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {quotes.length > 0 && (
        <div>
          <label className="field-label" htmlFor="pay-quote">
            Against quotation
          </label>
          <select id="pay-quote" className="input" value={quotationId} onChange={(e) => setQuotationId(e.target.value)}>
            <option value="">Not linked to a quotation</option>
            {quotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.number} — {formatInr(q.totalPaise)} ({q.balancePaise > 0 ? `${formatInr(q.balancePaise)} due` : "paid"})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="field-label" htmlFor="pay-amount">
          Amount (₹) <span className="text-red-500">*</span>
        </label>
        <input
          id="pay-amount"
          className="input text-lg font-bold"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {quote && quote.balancePaise > 0 && (
          <p className="mt-1 text-xs text-slate-500">Balance on {quote.number}: {formatInr(quote.balancePaise)}</p>
        )}
      </div>

      <div>
        <p className="field-label">Mode</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                mode === m
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {PAYMENT_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="pay-ref">
            Reference
          </label>
          <input
            id="pay-ref"
            className="input"
            placeholder={mode === "cheque" ? "Cheque number" : mode === "upi" ? "UPI transaction ID" : "Optional"}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="pay-date">
            Received on
          </label>
          <input id="pay-date" className="input" type="date" max={todayInput()} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="pay-notes">
          Notes
        </label>
        <textarea id="pay-notes" className="input min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Record payment"}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
