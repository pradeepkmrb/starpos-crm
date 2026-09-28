"use client";

import { useCallback, useEffect, useState } from "react";
import { PAYMENT_MODE_LABELS, formatInr } from "@starpos-crm/shared";
import { type Payment, type Quotation, listPayments, listQuotations } from "../../lib/api";
import { Drawer } from "../Drawer";
import { useToast } from "../Toaster";
import { BanknotesIcon, PlusIcon, ReceiptIcon } from "../icons";
import { PaymentForm } from "./PaymentForm";
import { QuotationBuilder } from "./QuotationBuilder";
import { QuotationStatusBadge, QuotationView } from "./QuotationView";

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * A lead's quotations and the money received from it, with shortcuts to quote
 * or record a payment without leaving the lead.
 */
export function LeadDeals({
  leadId,
  canEdit,
  onLeadChanged,
}: {
  leadId: string;
  canEdit: boolean;
  /** Accepting a quote wins the lead, so the board needs a refresh. */
  onLeadChanged: () => void;
}) {
  const toast = useToast();
  const [quotes, setQuotes] = useState<Quotation[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [builder, setBuilder] = useState<{ editing: Quotation | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ quotationId?: string } | null>(null);

  const load = useCallback(async () => {
    const [q, p] = await Promise.all([listQuotations({ leadId }), listPayments({ leadId })]);
    setQuotes(q);
    setPayments(p);
  }, [leadId]);

  useEffect(() => {
    load().catch(() => {
      setQuotes([]);
      setPayments([]);
    });
  }, [load]);

  const open = quotes?.find((q) => q.id === openId) ?? null;
  const collected = (payments ?? []).reduce((s, p) => s + p.amountPaise, 0);

  function upsert(q: Quotation) {
    setQuotes((all) => (all?.some((x) => x.id === q.id) ? all.map((x) => (x.id === q.id ? q : x)) : [q, ...(all ?? [])]));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quotations and payments</p>
        {canEdit && (
          <div className="flex gap-1">
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setBuilder({ editing: null })}>
              <PlusIcon className="h-3.5 w-3.5" />
              Quote
            </button>
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setPaying({})}>
              <PlusIcon className="h-3.5 w-3.5" />
              Payment
            </button>
          </div>
        )}
      </div>

      {quotes === null ? (
        <div className="skeleton h-16 rounded-2xl" />
      ) : quotes.length === 0 && (payments ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
          No quotations or payments yet.
        </p>
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setOpenId(q.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40"
            >
              <span className="icon-chip h-9 w-9 bg-brand-50 text-brand-600">
                <ReceiptIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">
                  {q.number} <span className="font-medium text-slate-400">· {day(q.createdAt)}</span>
                </p>
                <div className="mt-0.5">
                  <QuotationStatusBadge status={q.status} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold text-slate-900">{formatInr(q.totalPaise)}</p>
                {q.status === "accepted" && (
                  <p className={`text-xs font-semibold ${q.balancePaise > 0 ? "text-amber-600" : "text-brand-600"}`}>
                    {q.balancePaise > 0 ? `${formatInr(q.balancePaise)} due` : "Paid"}
                  </p>
                )}
              </div>
            </button>
          ))}
          {(payments ?? []).length > 0 && (
            <div className="rounded-2xl bg-brand-50/60 px-3 py-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-bold text-brand-800">
                  <BanknotesIcon className="h-4 w-4" />
                  Collected
                </span>
                <span className="font-extrabold text-brand-800">{formatInr(collected)}</span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {payments!.map((p) => (
                  <li key={p.id} className="flex justify-between text-xs text-brand-900/70">
                    <span>
                      {day(p.receivedAt)} · {PAYMENT_MODE_LABELS[p.mode]}
                      {p.quotation && ` · ${p.quotation.number}`}
                    </span>
                    <span className="font-semibold">{formatInr(p.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Drawer
        open={!!builder}
        onClose={() => setBuilder(null)}
        title={builder?.editing ? `Edit ${builder.editing.number}` : "New quotation"}
        subtitle="Totals update as you type"
        width="max-w-3xl"
      >
        {builder && (
          <QuotationBuilder
            leadId={leadId}
            editing={builder.editing}
            onCancel={() => setBuilder(null)}
            onSaved={(q) => {
              upsert(q);
              setBuilder(null);
              setOpenId(q.id);
              toast(builder.editing ? `${q.number} updated` : `${q.number} created`);
            }}
          />
        )}
      </Drawer>

      <Drawer
        open={!!open && !builder && !paying}
        onClose={() => setOpenId(null)}
        title={open?.number ?? ""}
        subtitle={open ? `Created by ${open.createdBy?.name ?? open.createdBy?.email ?? "—"}` : null}
      >
        {open && (
          <QuotationView
            quotation={open}
            canEdit={canEdit}
            onChanged={(q) => {
              upsert(q);
              onLeadChanged();
            }}
            onEdit={() => setBuilder({ editing: open })}
            onDeleted={() => {
              setQuotes((all) => all?.filter((x) => x.id !== open.id) ?? null);
              setOpenId(null);
            }}
            onRecordPayment={() => setPaying({ quotationId: open.id })}
          />
        )}
      </Drawer>

      <Drawer open={!!paying} onClose={() => setPaying(null)} title="Record payment">
        {paying && (
          <PaymentForm
            leadId={leadId}
            quotationId={paying.quotationId}
            onCancel={() => setPaying(null)}
            onSaved={(p) => {
              toast(`${formatInr(p.amountPaise)} recorded`);
              setPaying(null);
              void load();
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
