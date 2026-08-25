"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type ContactListSummary,
  type ImportResult,
  getAccessToken,
  importContacts,
  listContactLists,
  me,
} from "../../../lib/api";

export default function ContactsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [lists, setLists] = useState<ContactListSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, listsRes] = await Promise.all([me(), listContactLists()]);
        setRole(meRes.role);
        setLists(listsRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load contacts");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!role) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Contacts</h1>
      <p className="mt-1 text-sm text-slate-500">
        Import a CSV of phone numbers into a list, then target that list from a campaign.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Lists</h2>
        {lists.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No lists yet — import your first CSV below.</p>
        ) : (
          <div className="card mt-2 divide-y divide-slate-100">
            {lists.map((list) => (
              <div key={list.id} className="flex justify-between px-4 py-3 text-sm">
                <span className="text-slate-700">{list.name}</span>
                <span className="text-slate-500">{list._count.members} contacts</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {roleAtLeast(role, "admin") && (
        <ImportForm onImported={(list) => setLists((prev) => [list, ...prev])} />
      )}
    </div>
  );
}

function ImportForm({ onImported }: { onImported: (list: ContactListSummary) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [listName, setListName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await importContacts({ listName, csvText });
      setResult(res);
      if (res.listId) {
        onImported({
          id: res.listId,
          name: res.listName,
          createdAt: new Date().toISOString(),
          _count: { members: res.newContacts + res.existingContactsLinked },
        });
      }
      setListName("");
      setCsvText("");
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Import contacts</h2>
      <p className="mt-1 text-sm text-slate-500">
        CSV with a header row, e.g. <code className="rounded bg-slate-100 px-1">phone,name</code>. Phone
        numbers should include the country code.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="field-label">List name</span>
          <input
            required
            className="input"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">CSV file</span>
          <input ref={fileInputRef} required type="file" accept=".csv,text/csv" onChange={onFileChange} />
          {fileName && <span className="mt-1 block text-xs text-slate-500">{fileName} loaded</span>}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <p className="text-sm text-brand-800">
            Imported {result.newContacts} new contact(s), linked {result.existingContactsLinked}{" "}
            existing. Skipped {result.invalidRowCount} invalid and {result.duplicateInFileCount}{" "}
            duplicate row(s).
          </p>
        )}

        <button type="submit" disabled={submitting || !csvText} className="btn-primary">
          {submitting ? "Importing…" : "Import"}
        </button>
      </form>
    </section>
  );
}
