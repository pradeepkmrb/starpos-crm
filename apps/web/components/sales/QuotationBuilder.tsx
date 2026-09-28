"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInr, quoteTotals } from "@starpos-crm/shared";
import {
  ApiError,
  type Lead,
  type Product,
  type Quotation,
  type QuotationInput,
  createQuotation,
  listLeads,
  listProducts,
  updateQuotation,
} from "../../lib/api";
import { paiseToInput, rupeesToPaise } from "../../lib/money";
import { CloseIcon, PlusIcon } from "../icons";

interface Line {
  key: number;
  productId: string | null;
  name: string;
  quantity: string;
  price: string;
  taxPercent: string;
}

let nextKey = 1;
const blankLine = (): Line => ({ key: nextKey++, productId: null, name: "", quantity: "1", price: "", taxPercent: "18" });

function lineFromProduct(p: Product): Line {
  return {
    key: nextKey++,
    productId: p.id,
    name: p.name,
    quantity: "1",
    price: String(p.price),
    taxPercent: String(p.taxPercent),
  };
}

/**
 * The quotation editor (mockup screen 12): catalogue items or custom lines,
 * quantity, price and GST per line, a discount, and totals that update as you
 * type — computed by the same shared function the server uses.
 */
export function QuotationBuilder({
  leadId: fixedLeadId,
  editing,
  onSaved,
  onCancel,
}: {
  leadId?: string;
  editing?: Quotation | null;
  onSaved: (q: Quotation) => void;
  onCancel: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState(fixedLeadId ?? editing?.leadId ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    editing
      ? editing.items.map((i) => ({
          key: nextKey++,
          productId: i.productId,
          name: i.name,
          quantity: String(i.quantity),
          price: paiseToInput(i.unitPricePaise),
          taxPercent: String(i.taxPercent),
        }))
      : [blankLine()],
  );
  const [discount, setDiscount] = useState(editing ? paiseToInput(editing.discountPaise) : "");
  const [validUntil, setValidUntil] = useState(editing?.validUntil ? editing.validUntil.slice(0, 10) : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .catch(() => setProducts([]));
    if (!fixedLeadId && !editing) {
      listLeads({ limit: 500 })
        .then((all) => setLeads(all.filter((l) => l.status !== "lost")))
        .catch(() => setLeads([]));
    }
  }, [fixedLeadId, editing]);

  const parsed = lines.map((l) => ({
    quantity: Math.max(0, Math.round(Number(l.quantity) || 0)),
    unitPricePaise: rupeesToPaise(l.price) ?? 0,
    taxPercent: Math.min(100, Math.max(0, Number(l.taxPercent) || 0)),
  }));
  const totals = useMemo(() => quoteTotals(parsed, rupeesToPaise(discount) ?? 0), [parsed, discount]);

  function setLine(key: number, patch: Partial<Line>) {
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((all) => {
      // Replace a still-empty first line rather than leaving it dangling.
      const onlyBlank = all.length === 1 && !all[0].name && !all[0].price;
      return onlyBlank ? [lineFromProduct(product)] : [...all, lineFromProduct(product)];
    });
  }

  async function save() {
    if (!leadId) {
      setError("Choose who the quotation is for.");
      return;
    }
    const items = lines
      .map((l, i) => ({ l, p: parsed[i] }))
      .filter(({ l }) => l.name.trim() || l.productId);
    if (items.length === 0) {
      setError("Add at least one item.");
      return;
    }
    if (items.some(({ l, p }) => !l.name.trim() || p.quantity < 1 || rupeesToPaise(l.price) === null)) {
      setError("Each item needs a name, a quantity of at least 1 and a price.");
      return;
    }
    const input: QuotationInput = {
      leadId,
      items: items.map(({ l, p }) => ({
        ...(l.productId ? { productId: l.productId } : {}),
        name: l.name.trim(),
        quantity: p.quantity,
        unitPricePaise: p.unitPricePaise,
        taxPercent: p.taxPercent,
      })),
      discountPaise: rupeesToPaise(discount) ?? 0,
      validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : editing ? null : undefined,
      notes: notes.trim() || null,
    };
    setBusy(true);
    setError(null);
    try {
      const saved = editing
        ? await updateQuotation(editing.id, { items: input.items, discountPaise: input.discountPaise, validUntil: input.validUntil, notes: input.notes })
        : await createQuotation(input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the quotation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!fixedLeadId && !editing && (
        <div>
          <label className="field-label" htmlFor="quote-lead">
            Customer <span className="text-red-500">*</span>
          </label>
          <select id="quote-lead" className="input" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Choose a lead…</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.company ? `${l.company} — ${l.name}` : l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-900">Items</p>
          {products.length > 0 && (
            <select
              className="input w-60 py-2"
              value=""
              aria-label="Add from catalogue"
              onChange={(e) => {
                addProduct(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">+ Add from catalogue</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatInr(Math.round(p.price * 100))}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="hidden grid-cols-[1fr_70px_110px_70px_100px_32px] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 sm:grid">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price (₹)</span>
            <span className="text-right">GST %</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line, i) => (
              <div key={line.key} className="grid grid-cols-2 gap-2 px-3 py-2.5 sm:grid-cols-[1fr_70px_110px_70px_100px_32px] sm:items-center">
                <input
                  className="input col-span-2 py-2 sm:col-span-1"
                  placeholder="Item or service"
                  value={line.name}
                  onChange={(e) => setLine(line.key, { name: e.target.value })}
                  aria-label={`Item ${i + 1} name`}
                />
                <input
                  className="input py-2 text-right"
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                  aria-label={`Item ${i + 1} quantity`}
                />
                <input
                  className="input py-2 text-right"
                  inputMode="decimal"
                  placeholder="0"
                  value={line.price}
                  onChange={(e) => setLine(line.key, { price: e.target.value })}
                  aria-label={`Item ${i + 1} price`}
                />
                <input
                  className="input py-2 text-right"
                  inputMode="decimal"
                  value={line.taxPercent}
                  onChange={(e) => setLine(line.key, { taxPercent: e.target.value })}
                  aria-label={`Item ${i + 1} GST percent`}
                />
                <span className="self-center text-right text-sm font-bold text-slate-800">
                  {formatInr(totals.lineAmountsPaise[i] ?? 0)}
                </span>
                <button
                  type="button"
                  onClick={() => setLines((all) => (all.length === 1 ? [blankLine()] : all.filter((l) => l.key !== line.key)))}
                  className="justify-self-end rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove item ${i + 1}`}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLines((all) => [...all, blankLine()])}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add item
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="quote-discount">
            Discount (₹)
          </label>
          <input
            id="quote-discount"
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="quote-valid">
            Valid until
          </label>
          <input id="quote-valid" className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          {!validUntil && !editing && <p className="mt-1 text-xs text-slate-500">Leave empty to use your default validity.</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="quote-notes">
            Notes for the customer
          </label>
          <textarea
            id="quote-notes"
            className="input min-h-[72px]"
            placeholder="Delivery timeline, what's included…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4">
        <Row label="Subtotal" value={formatInr(totals.subtotalPaise)} />
        {totals.discountPaise > 0 && <Row label="Discount" value={`− ${formatInr(totals.discountPaise)}`} />}
        {totals.taxByRate.map((t) => (
          <Row key={t.taxPercent} label={`GST (${t.taxPercent}%)`} value={formatInr(t.taxPaise)} />
        ))}
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-base font-bold text-slate-900">Grand total</span>
          <span className="text-2xl font-extrabold text-brand-700">{formatInr(totals.totalPaise)}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create quotation"}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
