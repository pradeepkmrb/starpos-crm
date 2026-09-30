"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_MODE_LABELS, formatInr, type PaymentMode } from "@starpos-crm/shared";
import { ApiError, type Payment, deletePayment, getAccessToken, listPayments, me } from "../../../lib/api";
import { currentMonthInput } from "../../../lib/money";
import { Drawer } from "../../../components/Drawer";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useToast } from "../../../components/Toaster";
import { NEW_PAYMENT_EVENT, consumeNewFlag } from "../../../components/nav";
import { BanknotesIcon, PlusIcon } from "../../../components/icons";
import { PaymentForm } from "../../../components/sales/PaymentForm";
import { useAccess } from "../../../components/AccessContext";

const MODE_TONE: Record<PaymentMode, string> = {
  cash: "bg-brand-50 text-brand-700",
  upi: "bg-violet-50 text-violet-700",
  cheque: "bg-amber-50 text-amber-700",
  bank_transfer: "bg-sky-50 text-sky-700",
  card: "bg-rose-50 text-rose-700",
  other: "bg-slate-100 text-slate-600",
};

/** Local month bounds for "YYYY-MM". */
function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Money received, month by month: who paid, how, and who collected it. */
export default function PaymentsPage() {
  const access = useAccess();
  const router = useRouter();
  const toast = useToast();
  const [myId, setMyId] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonthInput());
  const [scope, setScope] = useState<"me" | "everyone">("everyone");
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const canEdit = access.canEdit("payments");
  const isAdmin = access.seesAll && access.canEdit("payments");

  const load = useCallback(
    async () => setPayments(await listPayments({ ...monthBounds(month), collector: scope === "me" ? "me" : undefined })),
    [month, scope],
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    Promise.all([me(), load()])
      .then(([meRes]) => {
        setMyId(meRes.user.id);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push("/login");
        else setError(err instanceof ApiError ? err.message : "Could not load payments");
      });
  }, [router, load]);

  useEffect(() => {
    if (consumeNewFlag()) setFormOpen(true);
    const open = () => setFormOpen(true);
    window.addEventListener(NEW_PAYMENT_EVENT, open);
    return () => window.removeEventListener(NEW_PAYMENT_EVENT, open);
  }, []);

  const summary = useMemo(() => {
    const byMode = new Map<PaymentMode, number>();
    let total = 0;
    for (const p of payments ?? []) {
      total += p.amountPaise;
      byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + p.amountPaise);
    }
    return { total, byMode: [...byMode.entries()].sort((a, b) => b[1] - a[1]) };
  }, [payments]);

  async function remove(p: Payment) {
    if (!window.confirm(`Delete the ${formatInr(p.amountPaise)} payment from ${p.lead.company ?? p.lead.name}?`)) return;
    try {
      await deletePayment(p.id);
      setPayments((all) => all?.filter((x) => x.id !== p.id) ?? null);
      toast("Payment deleted");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete", "error");
    }
  }

  if (!payments && !error) return <PageSkeleton />;

  // Group by day, newest first — the list reads like a collection diary.
  const days = new Map<string, Payment[]>();
  for (const p of payments ?? []) {
    const key = new Date(p.receivedAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    days.set(key, [...(days.get(key) ?? []), p]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Everything collected from customers — cash, UPI, cheques and transfers.</p>
        </div>
        {canEdit && (
          <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Record payment
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-brand-800 p-6 text-white shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1">
              <button type="button" className="rounded-lg px-2 py-1 text-sm hover:bg-white/10" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
                ‹
              </button>
              <span className="px-2 text-sm font-semibold">{monthLabel(month)}</span>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm hover:bg-white/10 disabled:opacity-30"
                disabled={month >= currentMonthInput()}
                onClick={() => setMonth(shiftMonth(month, 1))}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <select
              className="rounded-xl border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white focus:ring-2 focus:ring-white/30"
              value={scope}
              aria-label="Whose collections"
              onChange={(e) => setScope(e.target.value as "me" | "everyone")}
            >
              <option className="text-slate-900" value="everyone">
                Everyone
              </option>
              <option className="text-slate-900" value="me">
                Collected by me
              </option>
            </select>
          </div>
          <p className="mt-6 text-sm text-ink-200">Collected</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{formatInr(summary.total)}</p>
          <p className="mt-1 text-sm text-ink-200">
            {payments?.length ?? 0} {payments?.length === 1 ? "payment" : "payments"}
          </p>
          <BanknotesIcon className="pointer-events-none absolute -bottom-6 -right-6 h-40 w-40 text-white/5" />
        </div>

        <div className="card p-5">
          <p className="text-sm font-bold text-slate-900">By mode</p>
          {summary.byMode.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Nothing collected this month yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {summary.byMode.map(([mode, amount]) => (
                <div key={mode}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-slate-700">{PAYMENT_MODE_LABELS[mode]}</span>
                    <span className="font-bold text-slate-900">{formatInr(amount)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(amount / summary.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {payments && payments.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <span className="icon-chip h-14 w-14 bg-brand-50 text-brand-600">
            <BanknotesIcon className="h-7 w-7" />
          </span>
          <p className="mt-4 font-bold text-slate-900">No payments in {monthLabel(month)}</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Record money as it comes in; link it to an accepted quotation to track what&apos;s still due.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {[...days.entries()].map(([dayLabel, list]) => (
            <div key={dayLabel}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{dayLabel}</p>
                <p className="text-xs font-semibold text-slate-500">{formatInr(list.reduce((s, p) => s + p.amountPaise, 0))}</p>
              </div>
              <ul className="card divide-y divide-slate-100">
                {list.map((p) => (
                  <li key={p.id} className="group flex items-center gap-4 px-4 py-3.5">
                    <span className={`icon-chip ${MODE_TONE[p.mode]}`}>
                      <BanknotesIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900">{p.lead.company ?? p.lead.name}</p>
                      <p className="truncate text-sm text-slate-500">
                        {PAYMENT_MODE_LABELS[p.mode]}
                        {p.reference && ` · ${p.reference}`}
                        {p.quotation && ` · ${p.quotation.number}`}
                        {p.collectedBy && ` · by ${p.collectedBy.name ?? p.collectedBy.email}`}
                      </p>
                    </div>
                    <p className="font-extrabold text-brand-700">+{formatInr(p.amountPaise)}</p>
                    {(isAdmin || p.collectedBy?.id === myId) && (
                      <button
                        type="button"
                        onClick={() => void remove(p)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Record payment" subtitle="Money received from a customer">
        {formOpen && (
          <PaymentForm
            onCancel={() => setFormOpen(false)}
            onSaved={(p) => {
              toast(`${formatInr(p.amountPaise)} recorded`);
              setFormOpen(false);
              void load();
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
