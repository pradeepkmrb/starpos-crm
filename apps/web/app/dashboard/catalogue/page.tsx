"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  mediaUrl,
  reorderProducts,
  updateProduct,
  uploadImage,
} from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { BoxIcon, CameraIcon, ChevronRightIcon, LinkIcon, PlusIcon, SearchIcon, ShareIcon } from "../../../components/icons";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useToast } from "../../../components/Toaster";
import { EmptyState, PageHeader } from "../../../components/ui";
import { useAccess } from "../../../components/AccessContext";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

export default function CataloguePage() {
  const access = useAccess();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const setNotice = (message: string | null) => {
    if (message) toast(message);
  };
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, productsRes] = await Promise.all([me(), listProducts()]);
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

  const canManage = access.canEdit("catalogue");

  // Built in the browser so the link always points at the deployment the
  // operator is actually using.
  const shareUrl = useMemo(() => {
    if (!tenant || typeof window === "undefined") return "";
    return `${window.location.origin}/catalogue/${tenant.slug}`;
  }, [tenant]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [products],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inCategory = category ? products.filter((p) => p.category === category) : products;
    if (!q) return inCategory;
    return inCategory.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [products, search, category]);

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

  /** Moves a product to `to` (an index in the full list) and saves the new order. */
  async function move(product: Product, to: number) {
    const from = products.findIndex((p) => p.id === product.id);
    if (from < 0 || to < 0 || to >= products.length || from === to) return;
    const previous = products;
    const next = [...products];
    next.splice(to, 0, ...next.splice(from, 1));
    setProducts(next);
    setSavingOrder(true);
    try {
      setProducts(await reorderProducts(next.map((p) => p.id)));
    } catch (err) {
      setProducts(previous);
      toast(err instanceof ApiError ? err.message : "Couldn't save the new order");
    } finally {
      setSavingOrder(false);
    }
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

  const openAdd = () => {
    setEditing(null);
    setAdding(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BoxIcon}
        title="Catalogue"
        subtitle="Products and prices you can share as a link, and pick from when building a quotation."
        actions={
          canManage && (
            <button type="button" onClick={openAdd} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              Add product
            </button>
          )
        }
      />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-6 text-white shadow-brand">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-100">Your public catalogue</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight">
              {products.length} {products.length === 1 ? "product" : "products"}
              {categories.length > 0 && <span className="text-lg font-semibold text-brand-100"> in {categories.length} {categories.length === 1 ? "category" : "categories"}</span>}
            </p>
            {shareUrl && <p className="mt-2 truncate rounded-lg bg-black/15 px-3 py-1.5 font-mono text-xs text-brand-50">{shareUrl}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCopyLink} className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/25">
              <LinkIcon className="h-4 w-4" />
              Copy link
            </button>
            <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              <ShareIcon className="h-4 w-4" />
              Share on WhatsApp
            </button>
          </div>
        </div>
      </section>

      {products.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BoxIcon}
            title="No products yet"
            text="Add what you sell — then share the catalogue on WhatsApp or pick items straight into a quotation."
            action={
              canManage && (
                <button type="button" onClick={openAdd} className="btn-primary">
                  <PlusIcon className="h-4 w-4" />
                  Add your first product
                </button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {categories.length > 0 &&
              [null, ...categories].map((c) => (
                <button
                  key={c ?? "all"}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    category === c ? "bg-brand-600 text-white" : "bg-white text-slate-600 shadow-card hover:text-slate-900"
                  }`}
                >
                  {c ?? "All"}
                </button>
              ))}
            <div className="relative ml-auto w-full sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input py-2 pl-9" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {canManage && products.length > 1 && (
            <p className="text-xs text-slate-500">
              {category || search.trim()
                ? "Clear the search and category filter to change the display order."
                : "Use the arrows on each product to set the order customers see on your catalogue link."}
            </p>
          )}

          {visible.length === 0 ? (
            <div className="card">
              <EmptyState icon={SearchIcon} tone="slate" title="Nothing matches" text={`No products match “${search}”.`} compact />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map((p, index) => (
                <article key={p.id} className="card card-hover group flex flex-col overflow-hidden">
                  <div className="relative aspect-[2/1] bg-gradient-to-br from-brand-50 to-slate-100">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(p.imageUrl) ?? ""} alt="" className="h-full w-full object-cover" />
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
                    {p.stock === 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">Out of stock</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-bold text-slate-900">{p.name}</p>
                    {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{p.description}</p>}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <div>
                        <p className="text-xl font-extrabold text-slate-900">{formatMoney(p.price, p.currency)}</p>
                        <p className="text-xs text-slate-500">
                          {p.taxPercent > 0 ? `+ ${p.taxName ?? "Tax"} ${p.taxPercent}%` : "No tax"}
                          {p.sku && ` · ${p.sku}`}
                          {p.stock !== null && p.stock > 0 && ` · ${p.stock} in stock`}
                        </p>
                      </div>
                    </div>
                  </div>
                  {canManage && !category && !search.trim() && products.length > 1 && (
                    <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-2">
                      <span className="mr-auto text-xs font-semibold text-slate-500">Position {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => move(p, 0)}
                        disabled={savingOrder || index === 0}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-30"
                        title="Show first"
                      >
                        First
                      </button>
                      <button
                        type="button"
                        onClick={() => move(p, index - 1)}
                        disabled={savingOrder || index === 0}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        aria-label={`Move ${p.name} earlier`}
                        title="Move earlier"
                      >
                        <ChevronRightIcon className="h-4 w-4 rotate-180" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(p, index + 1)}
                        disabled={savingOrder || index === products.length - 1}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        aria-label={`Move ${p.name} later`}
                        title="Move later"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {canManage && (
                    <div className="flex border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setEditing(p);
                        }}
                        className="flex-1 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(p)}
                        disabled={deletingId === p.id}
                        className="flex-1 border-l border-slate-100 py-2.5 text-sm font-semibold text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        {deletingId === p.id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

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
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="my-8 w-full max-w-2xl animate-toast-in rounded-3xl bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={product ? `Edit ${product.name}` : "Add product"}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {product ? `Edit “${product.name}”` : "Add product"}
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

          <ImageField value={imageUrl} onChange={setImageUrl} />

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

/** Longest side an uploaded product photo is scaled down to. */
const MAX_IMAGE_SIDE = 1600;

/**
 * Shrinks a picked photo in the browser and re-encodes it as JPEG, so a
 * 10 MB phone photo fits the API's 2 MB limit. Returns base64 without the
 * data: prefix.
 */
async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency; a white backdrop keeps PNG cut-outs clean.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (base64.length * 0.75 <= 1.9 * 1024 * 1024) return base64;
  }
  throw new Error("That image is too large even after shrinking it — try a smaller one.");
}

/** Upload a photo, or paste a link to one hosted elsewhere. */
function ImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploaded = value.startsWith("/media/");
  const preview = mediaUrl(value.trim());

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (JPEG, PNG or WebP).");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImage("image/jpeg", await prepareImage(file));
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <span className="field-label">Product Image</span>
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <BoxIcon className="h-8 w-8 text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-secondary">
              <CameraIcon className="h-4 w-4" />
              {uploading ? "Uploading…" : preview ? "Replace image" : "Upload image"}
            </button>
            {preview && (
              <button type="button" onClick={() => onChange("")} className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700">
                Remove
              </button>
            )}
          </div>
          <input
            className="input"
            placeholder="…or paste an image link (https://…)"
            value={uploaded ? "" : value}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="text-xs text-slate-500">JPEG, PNG or WebP. Large photos are resized automatically.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
    </div>
  );
}
