"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import {
  ApiError,
  type Contact,
  type ContactListSummary,
  type CustomFieldDefinition,
  type CustomFieldValues,
  type ImportResult,
  addContactsToList,
  bulkDeleteContacts,
  createContact,
  createContactList,
  deleteAllContacts,
  deleteContact,
  deleteContactList,
  getAccessToken,
  importContacts,
  listContactLists,
  listContacts,
  listCustomFields,
  me,
  updateContact,
} from "../../../lib/api";
import {
  ContactDetailPanel,
  CustomFieldsFieldset,
  blankValues,
  toCustomFieldValues,
  type CustomValues,
} from "./ContactCustomFields";

/** Matches the server's own ceiling on ?limit=. */
const CONTACT_FETCH_LIMIT = 5000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** RFC 4180 quoting — a name with a comma or quote must not break the column layout. */
function csvCell(value: string | null): string {
  const s = value ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(contacts: Contact[]) {
  const rows = [
    ["phone", "name", "source", "opted_in", "created_at"],
    ...contacts.map((c) => [
      csvCell(c.whatsappNumber),
      csvCell(c.name),
      csvCell(c.source),
      c.optedIn ? "yes" : "no",
      csvCell(c.createdAt),
    ]),
  ];
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ContactsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactListSummary[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, contactsRes, listsRes, fieldsRes] = await Promise.all([
          me(),
          listContacts(CONTACT_FETCH_LIMIT),
          listContactLists(),
          listCustomFields("contact"),
        ]);
        setRole(meRes.role);
        setContacts(contactsRes);
        setLists(listsRes);
        setFields(fieldsRes);
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.whatsappNumber.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.source ?? "").toLowerCase().includes(q),
    );
  }, [contacts, search]);

  // Only what's on screen counts as "all", so a search narrows the blast radius.
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((c) => next.delete(c.id));
      else visible.forEach((c) => next.add(c.id));
      return next;
    });
  }

  async function onSaveDetails(contact: Contact, values: CustomFieldValues) {
    setError(null);
    setNotice(null);
    try {
      const updated = await updateContact(contact.id, { customFields: values });
      setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setNotice(`Saved details for ${updated.name ?? updated.whatsappNumber}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save these details");
    }
  }

  async function onDeleteOne(contact: Contact) {
    const label = contact.name ? `${contact.name} (${contact.whatsappNumber})` : contact.whatsappNumber;
    if (!window.confirm(`Delete ${label}? Their message history is erased too. This cannot be undone.`)) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await deleteContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
      setNotice(`Deleted ${label}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete contact");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAll() {
    if (
      !window.confirm(
        `Delete all ${contacts.length} contacts? Every contact and their message history is erased. This cannot be undone.`,
      )
    ) {
      return;
    }
    // A full wipe is worth a second, deliberate step.
    if (window.prompt('Type DELETE to confirm wiping the entire audience.') !== "DELETE") {
      setNotice("Delete all cancelled.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { deleted } = await deleteAllContacts();
      setContacts([]);
      setSelected(new Set());
      setNotice(`Deleted all ${deleted} contacts.`);
      setLists(await listContactLists());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete all contacts");
    } finally {
      setBusy(false);
    }
  }

  /** A list can be created before it has any members — contacts get added later. */
  async function onCreateEmptyList(name: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const list = await createContactList({ name });
      setLists((prev) => [list, ...prev]);
      setNewListName("");
      setNotice(`Created the list “${list.name}”.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the list");
    } finally {
      setBusy(false);
    }
  }

  async function onAddToList(listId: string | null, newListName: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const list = listId
        ? await addContactsToList(listId, ids)
        : await createContactList({ name: newListName, contactIds: ids });
      setLists((prev) => [list, ...prev.filter((l) => l.id !== list.id)]);
      setSelected(new Set());
      setNotice(`${ids.length} contact${ids.length === 1 ? "" : "s"} added to “${list.name}”.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add contacts to the list");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteList(list: ContactListSummary) {
    if (!window.confirm(`Delete the list “${list.name}”? The contacts in it are kept.`)) return;
    setError(null);
    setNotice(null);
    try {
      await deleteContactList(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      setNotice(`Deleted the list “${list.name}”.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete the list");
    }
  }

  async function onDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} contact${ids.length === 1 ? "" : "s"}? Their message history is erased too. This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { deleted } = await bulkDeleteContacts(ids);
      const removed = new Set(ids);
      setContacts((prev) => prev.filter((c) => !removed.has(c.id)));
      setSelected(new Set());
      setNotice(`Deleted ${deleted} contact${deleted === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete contacts");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audience</h1>
          <p className="mt-1 text-sm text-slate-500">
            Add contacts one at a time or import a CSV, then target a list from a broadcast.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setImporting(false);
                setCreating((v) => !v);
              }}
              className="btn-primary"
            >
              Create contact
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(visible)}
              disabled={visible.length === 0}
              className="btn-secondary"
              title={search ? "Downloads the contacts matching your search" : "Downloads every contact"}
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setImporting((v) => !v);
              }}
              className="btn-secondary"
            >
              Upload CSV
            </button>
            <button
              type="button"
              onClick={onDeleteAll}
              disabled={contacts.length === 0 || busy}
              className="btn-danger"
            >
              Delete all contacts
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}

      {contacts.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {canManage && (
              <button
                type="button"
                onClick={onDeleteSelected}
                disabled={selected.size === 0 || busy}
                className="btn-danger"
              >
                Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            )}
            <span className="text-sm text-slate-500">
              {visible.length} of {contacts.length} shown
            </span>
          </div>
          {canManage &&
            (selected.size > 0 ? (
              <AddToListBar lists={lists} count={selected.size} busy={busy} onAdd={onAddToList} />
            ) : (
              // Without this the control is invisible until something is ticked,
              // which reads as "add to list doesn't work".
              <span className="text-sm text-slate-500">
                Tick contacts to add them to a list.
              </span>
            ))}
          <input
            className="input w-64"
            placeholder="Search name, number or source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <section className="mt-3">
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No contacts yet — add one with <span className="font-medium">Create contact</span>, or bring a
            list in with <span className="font-medium">Upload CSV</span>.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">No contacts match “{search}”.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  {canManage && (
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select all shown contacts"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Mobile number</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Marketing</th>
                  <th className="px-4 py-3 font-semibold">Created on</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c) => (
                  <Fragment key={c.id}>
                  <tr className="hover:bg-slate-50">
                    {canManage && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          aria-label={`Select ${c.whatsappNumber}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                        aria-expanded={expanded === c.id}
                      >
                        {c.name || <span className="text-slate-400">—</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{c.whatsappNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{c.source || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${c.optedIn ? "badge-success" : "badge-neutral"}`}>
                        {c.optedIn ? "Opted in" : "Opted out"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(c.createdAt)}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => onDeleteOne(c)}
                            disabled={busy}
                            className="btn-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {expanded === c.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={canManage ? 7 : 5} className="px-4 py-4">
                        <ContactDetailPanel
                          contact={c}
                          fields={fields}
                          canEdit={canManage}
                          onSave={(values) => onSaveDetails(c, values)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Lists</h2>
            <p className="mt-1 text-sm text-slate-500">
              A broadcast targets a list, so contacts need to be in one before you can send to them. Tick
              contacts above to add them to a list, or upload a CSV.
            </p>
          </div>
          {canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newListName.trim();
                if (!name) return;
                void onCreateEmptyList(name);
              }}
              className="flex items-end gap-2"
            >
              <input
                className="input w-48"
                placeholder="New list name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
              <button type="submit" disabled={busy || !newListName.trim()} className="btn-secondary">
                Create list
              </button>
            </form>
          )}
        </div>
        {lists.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No lists yet.</p>
        ) : (
          <div className="card mt-2 divide-y divide-slate-100">
            {lists.map((list) => (
              <div key={list.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-slate-700">{list.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{list._count.members} contacts</span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => onDeleteList(list)}
                      className="text-sm text-red-600 underline hover:text-red-700"
                    >
                      Delete list
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {canManage && creating && (
        <AddContactForm
          fields={fields}
          onCancel={() => setCreating(false)}
          onAdded={(contact) => {
            setContacts((prev) => [contact, ...prev]);
            setCreating(false);
            setNotice(`Added ${contact.whatsappNumber}.`);
          }}
        />
      )}

      {canManage && importing && (
        <ImportForm
          onCancel={() => setImporting(false)}
          onImported={(list, added) => {
            setLists((prev) => [list, ...prev]);
            setImporting(false);
            if (added > 0) {
              // Cheapest way to pick up rows the import created server-side.
              listContacts(CONTACT_FETCH_LIMIT).then(setContacts).catch(() => undefined);
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * The bridge between a manually built audience and a broadcast: without a list
 * membership, contacts added by hand can never be targeted.
 */
function AddToListBar({
  lists,
  count,
  busy,
  onAdd,
}: {
  lists: ContactListSummary[];
  count: number;
  busy: boolean;
  onAdd: (listId: string | null, newListName: string) => void;
}) {
  const [target, setTarget] = useState<string>("__new__");
  const [newListName, setNewListName] = useState("");
  const creatingNew = target === "__new__";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-600">Add {count} to</span>
      <select className="input w-auto" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="__new__">a new list…</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {creatingNew && (
        <input
          className="input w-48"
          placeholder="List name"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
        />
      )}
      <button
        type="button"
        onClick={() => onAdd(creatingNew ? null : target, newListName.trim())}
        disabled={busy || (creatingNew && newListName.trim().length === 0)}
        className="btn-secondary"
      >
        Add to list
      </button>
    </div>
  );
}

function AddContactForm({
  fields,
  onAdded,
  onCancel,
}: {
  fields: CustomFieldDefinition[];
  onAdded: (contact: Contact) => void;
  onCancel: () => void;
}) {
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [name, setName] = useState("");
  const [custom, setCustom] = useState<CustomValues>(() => blankValues(fields));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A field added while this form is open should still appear on it.
  useEffect(() => setCustom(blankValues(fields)), [fields]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      onAdded(
        await createContact({
          whatsappNumber,
          name: name || undefined,
          customFields: toCustomFieldValues(custom),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add contact");
    } finally {
      setSubmitting(false);
    }
  }

  const hasCustomFields = fields.some((field) => field.isActive);

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Create contact</h2>
      <p className="mt-1 text-sm text-slate-500">Add a single contact manually, including the country code.</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="field-label">WhatsApp number</span>
            <input
              required
              className="input"
              placeholder="+91XXXXXXXXXX"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">Name (optional)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        {hasCustomFields && (
          <div className="border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your contact fields
            </p>
            <CustomFieldsFieldset
              fields={fields}
              values={custom}
              busy={submitting}
              onChange={setCustom}
            />
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Adding…" : "Add contact"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function ImportForm({
  onImported,
  onCancel,
}: {
  onImported: (list: ContactListSummary, addedCount: number) => void;
  onCancel: () => void;
}) {
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
        onImported(
          {
            id: res.listId,
            name: res.listName,
            createdAt: new Date().toISOString(),
            _count: { members: res.newContacts + res.existingContactsLinked },
          },
          res.newContacts,
        );
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
      <h2 className="text-lg font-semibold text-slate-900">Upload contacts</h2>
      <p className="mt-1 text-sm text-slate-500">
        CSV with a header row, e.g. <code className="rounded bg-slate-100 px-1">phone,name</code>. Phone
        numbers should include the country code.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="field-label">List name</span>
          <input required className="input" value={listName} onChange={(e) => setListName(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">CSV file</span>
          <input ref={fileInputRef} required type="file" accept=".csv,text/csv" onChange={onFileChange} />
          {fileName && <span className="mt-1 block text-xs text-slate-500">{fileName} loaded</span>}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <p className="text-sm text-brand-800">
            Imported {result.newContacts} new contact(s), linked {result.existingContactsLinked} existing.
            Skipped {result.invalidRowCount} invalid and {result.duplicateInFileCount} duplicate row(s).
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting || !csvText} className="btn-primary">
            {submitting ? "Importing…" : "Import"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
