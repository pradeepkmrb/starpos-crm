"use client";

import { useState } from "react";
import { QUOTATION_STATUS_LABELS, formatInr, quoteTotals, type QuotationStatus } from "@starpos-crm/shared";
import { ApiError, type Quotation, deleteQuotation, sendQuotation, updateQuotation } from "../../lib/api";
import { useToast } from "../Toaster";
import { CopyIcon, DocumentIcon, ShareIcon } from "../icons";

export const QUOTATION_BADGE: Record<QuotationStatus, string> = {
  draft: "badge badge-neutral",
  sent: "badge badge-info",
  accepted: "badge badge-success",
  rejected: "badge badge-danger",
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <span className={QUOTATION_BADGE[status]}>{QUOTATION_STATUS_LABELS[status]}</span>;
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * One quotation as the customer will see it, with what can happen next:
 * open the PDF, send it on WhatsApp (or a share link when WhatsApp can't
 * deliver it directly), record the customer's answer, edit or delete a draft.
 */
export function QuotationView({
  quotation: q,
  canEdit,
  onChanged,
  onEdit,
  onDeleted,
  onRecordPayment,
}: {
  quotation: Quotation;
  canEdit: boolean;
  onChanged: (q: Quotation) => void;
  onEdit: () => void;
  onDeleted: () => void;
  onRecordPayment?: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<{ message: string; shareLink: string | null } | null>(null);
  const totals = quoteTotals(
    q.items.map((i) => ({ quantity: i.quantity, unitPricePaise: i.unitPricePaise, taxPercent: i.taxPercent })),
    q.discountPaise,
  );

  async function run<T>(action: () => Promise<T>, after: (r: T) => void) {
    setBusy(true);
    try {
      after(await action());
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(
      () => sendQuotation(q.id),
      (result) => {
        if (result.delivered) {
          setFallback(null);
          onChanged(result.quotation);
          toast(`${q.number} sent on WhatsApp`);
        } else {
          setFallback({ message: result.message, shareLink: result.shareLink });
        }
      },
    );

  const setStatus = (status: QuotationStatus, message: string) =>
    run(
      () => updateQuotation(q.id, { status }),
      (updated) => {
        onChanged(updated);
        toast(message);
      },
    );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(q.pdfUrl);
      toast("PDF link copied");
    } catch {
      toast("Couldn't copy — open the PDF and copy its address instead", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-100">{q.lead.company ?? q.lead.name}</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">{formatInr(q.totalPaise)}</p>
            <p className="mt-1 text-xs text-brand-100">
              {day(q.createdAt)}
              {q.validUntil && ` · valid until ${day(q.validUntil)}`}
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{QUOTATION_STATUS_LABELS[q.status]}</span>
        </div>
        {q.status === "accepted" && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-brand-100">
              <span>Collected {formatInr(q.paidPaise)}</span>
              <span>{q.balancePaise > 0 ? `${formatInr(q.balancePaise)} due` : "Fully paid"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${Math.min(100, q.totalPaise ? (q.paidPaise / q.totalPaise) * 100 : 0)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={q.pdfUrl} target="_blank" rel="noreferrer" className="btn-secondary">
          <DocumentIcon className="h-4 w-4" />
          Open PDF
        </a>
        <button type="button" className="btn-secondary" onClick={() => void copyLink()}>
          <CopyIcon className="h-4 w-4" />
          Copy link
        </button>
        {canEdit && q.status !== "rejected" && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void send()}>
            <ShareIcon className="h-4 w-4" />
            {q.status === "draft" ? "Send on WhatsApp" : "Send again"}
          </button>
        )}
      </div>

      {fallback && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">Not sent automatically</p>
          <p className="mt-1 text-amber-800">{fallback.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {fallback.shareLink && (
              <a
                href={fallback.shareLink}
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
                onClick={() => {
                  if (q.status === "draft") void setStatus("sent", `${q.number} marked as sent`);
                }}
              >
                Open WhatsApp to share
              </a>
            )}
            {q.status === "draft" && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void setStatus("sent", `${q.number} marked as sent`)}>
                I&apos;ve shared it — mark as sent
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Item</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 text-right font-semibold">Rate</th>
              <th className="px-4 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {q.items.map((item, i) => (
              <tr key={item.id}>
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-slate-800">{item.name}</p>
                  <p className="text-xs text-slate-500">GST {item.taxPercent}%</p>
                </td>
                <td className="px-2 py-2.5 text-right text-slate-600">{item.quantity}</td>
                <td className="px-2 py-2.5 text-right text-slate-600">{formatInr(item.unitPricePaise)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{formatInr(totals.lineAmountsPaise[i] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
          <Line label="Subtotal" value={formatInr(q.subtotalPaise)} />
          {q.discountPaise > 0 && <Line label="Discount" value={`− ${formatInr(q.discountPaise)}`} />}
          {totals.taxByRate.map((t) => (
            <Line key={t.taxPercent} label={`GST (${t.taxPercent}%)`} value={formatInr(t.taxPaise)} />
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
            <span>Grand total</span>
            <span className="text-brand-700">{formatInr(q.totalPaise)}</span>
          </div>
        </div>
      </div>

      {q.notes && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{q.notes}</p>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {(q.status === "draft" || q.status === "sent") && (
            <>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void setStatus("accepted", `${q.number} accepted — the lead is now won`)}>
                Mark accepted
              </button>
              {q.status === "sent" && (
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => void setStatus("rejected", `${q.number} marked as rejected`)}>
                  Mark rejected
                </button>
              )}
            </>
          )}
          {q.status === "accepted" && q.balancePaise > 0 && onRecordPayment && (
            <button type="button" className="btn-primary" onClick={onRecordPayment}>
              Record payment
            </button>
          )}
          {q.status === "draft" && (
            <>
              <button type="button" className="btn-ghost" disabled={busy} onClick={onEdit}>
                Edit
              </button>
              <button
                type="button"
                className="btn-ghost text-red-600 hover:bg-red-50"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Delete draft ${q.number}?`)) return;
                  void run(
                    () => deleteQuotation(q.id),
                    () => {
                      toast(`${q.number} deleted`);
                      onDeleted();
                    },
                  );
                }}
              >
                Delete draft
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
