"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getPublicCatalogue,
  mediaUrl,
  submitCatalogueEnquiry,
  type Product,
  type PublicCatalogue,
} from "../../../lib/api";
import { formatMoney, priceWithTax } from "../../../lib/money";
import { BoxIcon, CheckIcon, CloseIcon, PlusIcon } from "../../../components/icons";

const MAX_QUANTITY = 100_000;

/**
 * The shopper-facing catalogue behind a shared link. Deliberately
 * unauthenticated — it renders whatever /public/catalogue/<slug> returns,
 * which is the workspace name and its products and nothing else. Shoppers
 * can pick quantities and request a quote, which reaches the business as a
 * lead with a draft quotation.
 */
export default function PublicCataloguePage({ params }: { params: { slug: string } }) {
  const [catalogue, setCatalogue] = useState<PublicCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [requesting, setRequesting] = useState(false);
  const [sentReference, setSentReference] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getPublicCatalogue(params.slug)
      .then(setCatalogue)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? "This catalogue isn't available."
            : "Failed to load this catalogue.",
        ),
      )
      .finally(() => setLoading(false));
  }, [params.slug]);

  const selected = useMemo(
    () => (catalogue?.products ?? []).filter((p) => (quantities[p.id] ?? 0) > 0),
    [catalogue, quantities],
  );
  const itemCount = selected.reduce((sum, p) => sum + quantities[p.id]!, 0);
  // Only totalled when everything is priced in one currency.
  const currencies = new Set(selected.map((p) => p.currency));
  const estimate =
    currencies.size === 1 ? selected.reduce((sum, p) => sum + priceWithTax(p) * quantities[p.id]!, 0) : null;

  function setQuantity(productId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(MAX_QUANTITY, Math.floor(quantity) || 0)) }));
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading catalogue…</p>;
  if (error || !catalogue) return <p className="p-6 text-sm text-slate-600">{error}</p>;

  const { tenant, products } = catalogue;

  if (sentReference !== undefined) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-leaf-500 text-white shadow-leaf">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">Request sent</h1>
        <p className="mt-2 text-slate-600">
          Thanks! {tenant.name} has your request and will get back to you with a quotation shortly.
        </p>
        {sentReference && <p className="mt-3 text-sm text-slate-500">Reference: {sentReference}</p>}
        <button
          type="button"
          className="btn-secondary mt-6"
          onClick={() => {
            setSentReference(undefined);
            setQuantities({});
          }}
        >
          Back to the catalogue
        </button>
      </main>
    );
  }

  return (
    <main className={`mx-auto max-w-5xl px-4 py-8 ${itemCount > 0 ? "pb-32" : ""}`}>
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-6 text-white shadow-brand">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-leaf-500/25" />
        <h1 className="relative text-2xl font-bold">{tenant.name}</h1>
        <p className="relative mt-1 text-sm text-brand-100">
          {products.length} {products.length === 1 ? "product" : "products"}
          {products.length > 0 && " · pick quantities and request a quote"}
        </p>
      </header>

      {products.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">This catalogue is empty for now.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              quantity={quantities[p.id] ?? 0}
              onQuantity={(q) => setQuantity(p.id, q)}
            />
          ))}
        </ul>
      )}

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">
                {selected.length} {selected.length === 1 ? "product" : "products"} · {itemCount} {itemCount === 1 ? "unit" : "units"}
              </p>
              {estimate !== null && (
                <p className="text-sm text-slate-500">
                  Approx. {formatMoney(estimate, selected[0]!.currency)} incl. tax
                </p>
              )}
            </div>
            <button type="button" className="btn-primary px-5" onClick={() => setRequesting(true)}>
              Request quote
            </button>
          </div>
        </div>
      )}

      {requesting && (
        <RequestQuoteDialog
          slug={params.slug}
          businessName={tenant.name}
          items={selected.map((p) => ({ product: p, quantity: quantities[p.id]! }))}
          onClose={() => setRequesting(false)}
          onSent={(reference) => {
            setRequesting(false);
            setSentReference(reference);
          }}
        />
      )}
    </main>
  );
}

function ProductCard({
  product: p,
  quantity,
  onQuantity,
}: {
  product: Product;
  quantity: number;
  onQuantity: (quantity: number) => void;
}) {
  const image = mediaUrl(p.imageUrl);
  const soldOut = p.stock === 0;
  return (
    <li className={`card flex flex-col overflow-hidden ${quantity > 0 ? "ring-2 ring-leaf-500" : ""}`}>
      <div className="relative aspect-[4/3] bg-gradient-to-br from-brand-50 to-slate-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={p.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BoxIcon className="h-12 w-12 text-brand-300" />
          </div>
        )}
        {p.category && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-bold text-slate-700 shadow-sm">
            {p.category}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="font-bold text-slate-900">{p.name}</h2>
        {p.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{p.description}</p>}
        <div className="mt-auto pt-3">
          <p className="text-xl font-extrabold text-slate-900">{formatMoney(priceWithTax(p), p.currency)}</p>
          {p.taxPercent > 0 && (
            <p className="text-xs text-slate-500">
              {formatMoney(p.price, p.currency)} + {p.taxName ?? "tax"} {p.taxPercent}%
            </p>
          )}
        </div>
        <div className="mt-3">
          {soldOut ? (
            <span className="badge badge-danger">Out of stock</span>
          ) : quantity === 0 ? (
            <button type="button" className="btn-secondary w-full" onClick={() => onQuantity(1)}>
              <PlusIcon className="h-4 w-4" />
              Add to quote
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary h-10 w-10 px-0 text-lg"
                onClick={() => onQuantity(quantity - 1)}
                aria-label={`One less ${p.name}`}
              >
                −
              </button>
              <input
                className="input h-10 flex-1 text-center font-semibold"
                inputMode="numeric"
                aria-label={`Quantity of ${p.name}`}
                value={quantity}
                onChange={(e) => onQuantity(Number(e.target.value.replace(/\D/g, "")))}
              />
              <button
                type="button"
                className="btn-secondary h-10 w-10 px-0 text-lg"
                onClick={() => onQuantity(quantity + 1)}
                aria-label={`One more ${p.name}`}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function RequestQuoteDialog({
  slug,
  businessName,
  items,
  onClose,
  onSent,
}: {
  slug: string;
  businessName: string;
  items: { product: Product; quantity: number }[];
  onClose: () => void;
  onSent: (reference: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await submitCatalogueEnquiry(slug, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        message: message.trim() || undefined,
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        website,
      });
      onSent(res.reference);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your request — please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-ink-950/40 sm:items-start sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg animate-toast-in rounded-t-3xl bg-white p-6 shadow-pop sm:my-8 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Request a quote"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Request a quote</h2>
            <p className="text-sm text-slate-500">{businessName} will send you a quotation for these items.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {items.map(({ product, quantity }) => (
            <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate text-slate-700">{product.name}</span>
              <span className="shrink-0 font-semibold text-slate-900">× {quantity}</span>
            </li>
          ))}
        </ul>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="field-label">Your name</span>
            <input required autoFocus maxLength={120} className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Mobile / WhatsApp number</span>
            <input
              required
              type="tel"
              inputMode="tel"
              maxLength={24}
              placeholder="e.g. 98765 43210"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Email (optional)</span>
              <input type="email" maxLength={200} className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Business name (optional)</span>
              <input maxLength={200} className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="field-label">Anything else? (optional)</span>
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="Delivery location, timeline, questions…"
              className="input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={sending} className="btn-primary w-full">
            {sending ? "Sending…" : "Send request"}
          </button>
        </form>
      </div>
    </div>
  );
}
