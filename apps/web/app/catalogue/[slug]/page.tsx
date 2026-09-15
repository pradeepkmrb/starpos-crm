"use client";

import { useEffect, useState } from "react";
import { ApiError, getPublicCatalogue, type PublicCatalogue } from "../../../lib/api";
import { formatMoney, priceWithTax } from "../../../lib/money";
import { BoxIcon } from "../../../components/icons";

/**
 * The shopper-facing catalogue behind a shared link. Deliberately
 * unauthenticated — it renders whatever /public/catalogue/<slug> returns,
 * which is the workspace name and its products and nothing else.
 */
export default function PublicCataloguePage({ params }: { params: { slug: string } }) {
  const [catalogue, setCatalogue] = useState<PublicCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading catalogue…</p>;
  if (error || !catalogue) return <p className="p-6 text-sm text-slate-600">{error}</p>;

  const { tenant, products } = catalogue;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="card bg-brand-800 p-6 text-white">
        <h1 className="text-2xl font-semibold">{tenant.name}</h1>
        <p className="mt-1 text-sm text-brand-50/90">
          {products.length} {products.length === 1 ? "product" : "products"}
        </p>
      </header>

      {products.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">This catalogue is empty for now.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <li key={p.id} className="card card-hover flex gap-4 p-4">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <BoxIcon className="h-8 w-8 text-slate-300" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="truncate font-medium text-slate-900">{p.name}</h2>
                {p.category && <p className="text-xs text-slate-500">{p.category}</p>}
                {p.description && <p className="mt-1 text-sm text-slate-600">{p.description}</p>}
                <p className="mt-2 font-semibold text-slate-900">
                  {formatMoney(priceWithTax(p), p.currency)}
                </p>
                {p.taxPercent > 0 && (
                  <p className="text-xs text-slate-500">
                    {formatMoney(p.price, p.currency)} + {p.taxName ?? "tax"} {p.taxPercent}%
                  </p>
                )}
                {p.stock === 0 && <span className="badge badge-danger mt-2">Out of stock</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
