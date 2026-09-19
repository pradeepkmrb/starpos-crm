"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type AuthTenant,
  type Product,
  type ProductInput,
  createProduct,
  deleteProduct,
  getAccessToken,
  listProducts,
  me,
  updateProduct,
} from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { BoxIcon, LinkIcon, ShareIcon } from "../../../components/icons";
import { PageSkeleton } from "../../../components/PageSkeleton";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

export default function CataloguePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, productsRes] = await Promise.all([me(), listProducts()]);
        setRole(meRes.role);
        setTenant(meRes.tenant);
        setProducts(productsRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load the catalogue");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const canManage = role ? roleAtLeast(role, "admin") : false;

  // Built in the browser so the link always points at the deployment the
  // operator is actually using.
  const shareUrl = useMemo(() => {
    if (!tenant || typeof window === "undefined") return "";
    return `${window.location.origin}/catalogue/${tenant.slug}`;
  }, [tenant]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  async function onCopyLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Catalogue link copied.");
    } catch {
      // Clipboard access is denied over plain http and in some in-app
      // browsers — show the link so it can still be copied by hand.
      setNotice(`Copy this link: ${shareUrl}`);
    }
  }

  function onShare() {
    const text = `${tenant?.name ?? "Our"} catalogue: ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function onDelete(product: Product) {
    if (!window.confirm(`Remove "${product.name}" from the catalogue?`)) return;
    setError(null);
    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setNotice(`Removed "${product.name}".`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove the product");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <section className="card overflow-hidden bg-brand-800 p-6 text-white">
        <h1 className="text-2xl font-semibold">Product Catalogue</h1>
        <p className="mt-1 text-sm text-brand-50/90">
          {products.length} {products.length === 1 ? "product" : "products"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onCopyLink} className="btn-secondary">
            <LinkIcon className="h-4 w-4" />
            Copy Link
          </button>
          <button type="button" onClick={onShare} className="btn-secondary">
            <ShareIcon className="h-4 w-4" />
            Share Catalogue
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setAdding(true);
              }}
              className="btn-secondary"
            >
              + Add Product
            </button>
          )}
        </div>
      </section>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 break-all text-sm text-slate-600">{notice}</p>}

      {products.length > 0 && (
        <div className="mt-6 flex justify-end">
          <input
            className="input w-64"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <section className="mt-3">
        {products.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <BoxIcon className="h-12 w-12 text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-900">No products yet</h2>
            <p className="max-w-sm text-sm text-slate-500">
              Add products to your catalogue to share them over WhatsApp.
            </p>
            {canManage && (
              <button type="button" onClick={() => setAdding(true)} className="btn-primary">
                + Add Product
              </button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">No products match “{search}”.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Tax</th>
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                            <BoxIcon className="h-5 w-5 text-slate-400" />
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-slate-900">{p.name}</p>
                          {p.description && (
                            <p className="line-clamp-1 max-w-xs text-xs text-slate-500">{p.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.sku ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.category ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">
                      {formatMoney(p.price, p.currency)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {p.taxPercent > 0 ? `${p.taxName ?? "Tax"} ${p.taxPercent}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.stock === null ? (
                        <span className="badge badge-neutral">Not tracked</span>
                      ) : p.stock === 0 ? (
                        <span className="badge badge-danger">Out of stock</span>
                      ) : (
                        p.stock
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAdding(false);
                              setEditing(p);
                            }}
                            className="btn-secondary"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(p)}
                            disabled={deletingId === p.id}
                            className="btn-danger"
                          >
                            {deletingId === p.id ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (adding || editing) && (
        <ProductForm
          key={editing?.id ?? "new"}
          product={editing}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setProducts((prev) =>
              editing ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev],
            );
            setNotice(editing ? `Saved “${saved.name}”.` : `Added “${saved.name}” to the catalogue.`);
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Add/edit dialog. Numeric fields are kept as strings while typing so a
 * half-entered "12." doesn't get coerced to NaN mid-keystroke.
 */
function ProductForm({
  product,
  onSaved,
  onCancel,
}: {
  product: Product | null;
  onSaved: (product: Product) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [currency, setCurrency] = useState(product?.currency ?? "INR");
  const [stock, setStock] = useState(product?.stock != null ? String(product.stock) : "");
  const [taxPercent, setTaxPercent] = useState(product && product.taxPercent > 0 ? String(product.taxPercent) : "");
  const [taxName, setTaxName] = useState(product?.taxName ?? "GST");
  const [category, setCategory] = useState(product?.category ?? "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("Enter a price of 0 or more.");
      return;
    }
    const parsedTax = taxPercent.trim() === "" ? 0 : Number(taxPercent);
    if (!Number.isFinite(parsedTax) || parsedTax < 0 || parsedTax > 100) {
      setError("Tax % must be between 0 and 100.");
      return;
    }
    const parsedStock = stock.trim() === "" ? null : Number(stock);
    if (parsedStock !== null && (!Number.isInteger(parsedStock) || parsedStock < 0)) {
      setError("Stock must be a whole number, or blank if you don't track it.");
      return;
    }

    // Blank optional fields are sent as "" on an edit (the server reads that
    // as "cleared") but omitted entirely on a create, where there is nothing
    // to clear and the URL validator would reject an empty string.
    const input: ProductInput = {
      name: name.trim(),
      price: Math.round(parsedPrice * 100) / 100,
      currency,
      stock: parsedStock,
      taxPercent: Math.round(parsedTax * 100) / 100,
    };
    const optional = { sku, description, taxName, category, imageUrl };
    for (const [key, value] of Object.entries(optional)) {
      if (product || value.trim() !== "") Object.assign(input, { [key]: value.trim() });
    }

    setSubmitting(true);
    try {
      onSaved(product ? await updateProduct(product.id, input) : await createProduct(input));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="card my-8 w-full max-w-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={product ? `Edit ${product.name}` : "Add product"}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {product ? `Edit “${product.name}”` : "Add Product"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Product Name</span>
              <input
                required
                autoFocus
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">SKU</span>
              <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
            </label>
          </div>

          <label className="block">
            <span className="field-label">Description</span>
            <textarea
              className="input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="field-label">Price</span>
              <input
                required
                inputMode="decimal"
                className="input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">Currency</span>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Stock</span>
              <input
                inputMode="numeric"
                placeholder="blank = not tracked"
                className="input"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Tax %</span>
              <input
                inputMode="decimal"
                placeholder="e.g. 18 (0 = no tax)"
                className="input"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">Tax name</span>
              <input className="input" value={taxName} onChange={(e) => setTaxName(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Tax is added on top of the price and shown alongside it on the shared catalogue.
          </p>

          <label className="block">
            <span className="field-label">Category</span>
            <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>

          <label className="block">
            <span className="field-label">Product Image</span>
            <input
              className="input"
              placeholder="https://…"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Paste a link to an image that is already hosted somewhere.
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Saving…" : product ? "Save changes" : "Add Product"}
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
