"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHANNEL_LABELS,
  CHANNEL_SHORT_LABELS,
  roleAtLeast,
  type TenantRole,
} from "@digitel/shared";
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
import { PageSkeleton } from "../../../components/PageSkeleton";
import { Avatar } from "../../../components/Avatar";
import { Drawer } from "../../../components/Drawer";
import { useToast } from "../../../components/Toaster";
import { EmptyState, PageHeader, SectionCard, StatTile } from "../../../components/ui";
import { CheckIcon, ChevronDownIcon, DocumentIcon, ListIcon, PlusIcon, SearchIcon, UsersIcon } from "../../../components/icons";

/** Matches the server's own ceiling on ?limit=. */
const CONTACT_FETCH_LIMIT = 5000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** RFC 4180 quoting — a name with a comma or quote must not break the column layout. */
function csvCell(value: string | null): string {
  const s = value ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A contact's address on their own channel — a number, a platform id, or an email. */
function contactHandle(c: Contact): string {
  return c.externalId ?? c.whatsappNumber ?? "";
}

/** Tick boxes read as yes/no both ways, so an exported file can be re-imported. */
function answerCell(value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return csvCell(String(value));
}

function downloadCsv(contacts: Contact[], fields: CustomFieldDefinition[]) {
  // Custom columns are named by key, which is what the importer matches on.
  const custom = fields.filter((field) => field.isActive);
  const rows = [
    // The address column stays "phone" so an exported file still imports; the
    // importer ignores "channel", which is here to say where each row came from.
    [
      "channel",
      "phone",
      "name",
      "source",
      "opted_in",
      "created_at",
      ...custom.map((f) => csvCell(f.key)),
    ],
    ...contacts.map((c) => [
      csvCell(CHANNEL_LABELS[c.channelType]),
      csvCell(contactHandle(c)),
      csvCell(c.name),
      csvCell(c.source),
      c.optedIn ? "yes" : "no",
      csvCell(c.createdAt),
      ...custom.map((f) => answerCell(c.attributesJson?.[f.key])),
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
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactListSummary[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setNotice = (message: string | null) => {
    if (message) toast(message);
  };
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
        contactHandle(c).toLowerCase().includes(q) ||
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
    const label = contact.name ? `${contact.name} (${contactHandle(contact)})` : contactHandle(contact);
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

  if (loading) return <PageSkeleton />;
  if (!role) return null;

  const canManage = roleAtLeast(role, "admin");

  const optedIn = contacts.filter((c) => c.optedIn).length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const newThisMonth = contacts.filter((c) => new Date(c.createdAt).getTime() >= monthStart).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UsersIcon}
        tone="sky"
        title="Audience"
        subtitle="Everyone you can message. Group contacts into lists, then send a broadcast to a list."
        actions={
          canManage && (
            <>
              <button
                type="button"
                onClick={() => downloadCsv(visible, fields)}
                disabled={visible.length === 0}
                className="btn-ghost"
                title={search ? "Downloads the contacts matching your search" : "Downloads every contact"}
              >
                Download CSV
              </button>
              <button type="button" onClick={() => setImporting(true)} className="btn-secondary">
                <DocumentIcon className="h-4 w-4" />
                Upload CSV
              </button>
              <button type="button" onClick={() => setCreating(true)} className="btn-primary">
                <PlusIcon className="h-4 w-4" />
                Add contact
              </button>
            </>
          )
        }
      />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={UsersIcon} tone="sky" label="Contacts" value={contacts.length.toLocaleString("en-IN")} sub="in your audience" />
        <StatTile
          icon={CheckIcon}
          label="Opted in"
          value={contacts.length ? `${Math.round((optedIn / contacts.length) * 100)}%` : "—"}
          sub={`${optedIn.toLocaleString("en-IN")} can get marketing`}
        />
        <StatTile icon={ListIcon} tone="violet" label="Lists" value={lists.length} sub="ready for broadcasts" />
        <StatTile icon={PlusIcon} tone="amber" label="New this month" value={newThisMonth} sub="contacts added" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_20rem]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
            <div className="relative w-full sm:w-72">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input py-2 pl-9"
                placeholder="Search name, number or source"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="text-sm text-slate-500">
              {visible.length === contacts.length ? `${contacts.length} contacts` : `${visible.length} of ${contacts.length}`}
            </span>
          </div>

          {canManage && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50/70 px-4 py-2.5">
              <span className="text-sm font-bold text-brand-800">{selected.size} selected</span>
              <AddToListBar lists={lists} count={selected.size} busy={busy} onAdd={onAddToList} />
              <button type="button" onClick={onDeleteSelected} disabled={busy} className="btn-ghost ml-auto text-red-600 hover:bg-red-50">
                Delete selected
              </button>
            </div>
          )}

          {contacts.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              tone="sky"
              title="No contacts yet"
              text="Add people one at a time, or upload a CSV with a phone column — they'll land in a list you can broadcast to."
              action={
                canManage && (
                  <>
                    <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                      <PlusIcon className="h-4 w-4" />
                      Add contact
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setImporting(true)}>
                      Upload CSV
                    </button>
                  </>
                )
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={SearchIcon} tone="slate" title="No matches" text={`No contacts match “${search}”.`} compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                    {canManage && (
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          className="accent-brand-600"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          aria-label="Select all shown contacts"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold">Marketing</th>
                    <th className="px-4 py-3 font-semibold">Added</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((c) => (
                    <Fragment key={c.id}>
                      <tr className={`group transition-colors hover:bg-slate-50 ${selected.has(c.id) ? "bg-brand-50/40" : ""}`}>
                        {canManage && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="accent-brand-600"
                              checked={selected.has(c.id)}
                              onChange={() => toggleOne(c.id)}
                              aria-label={`Select ${contactHandle(c)}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            className="flex items-center gap-3 text-left"
                            onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                            aria-expanded={expanded === c.id}
                          >
                            <Avatar name={c.name || contactHandle(c)} size="h-9 w-9 text-xs" />
                            <span>
                              <span className="block font-semibold text-slate-900">{c.name || contactHandle(c)}</span>
                              <span className="block text-xs text-slate-500">
                                {contactHandle(c)} · {CHANNEL_SHORT_LABELS[c.channelType]}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 capitalize text-slate-600">{c.source || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`badge ${c.optedIn ? "badge-success" : "badge-neutral"}`}>
                            {c.optedIn ? "Opted in" : "Opted out"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatDate(c.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => onDeleteOne(c)}
                                disabled={busy}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                              >
                                Delete
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                              aria-label="Details"
                            >
                              <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded === c.id ? "rotate-180" : ""}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === c.id && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={canManage ? 6 : 5} className="px-4 py-4">
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

        <div className="space-y-6">
          <SectionCard title="Lists" subtitle="Broadcasts go to a list" bodyClassName="">
            {lists.length === 0 ? (
              <EmptyState icon={ListIcon} tone="violet" title="No lists yet" text="Tick contacts and choose “Add to list”, or upload a CSV." compact />
            ) : (
              <ul className="divide-y divide-slate-100">
                {lists.map((list) => (
                  <li key={list.id} className="group flex items-center gap-3 px-5 py-3">
                    <span className="icon-chip h-9 w-9 bg-violet-50 text-violet-600">
                      <ListIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{list.name}</p>
                      <p className="text-xs text-slate-500">
                        {list._count.members} {list._count.members === 1 ? "contact" : "contacts"}
                      </p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onDeleteList(list)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newListName.trim();
                  if (!name) return;
                  void onCreateEmptyList(name);
                }}
                className="flex gap-2 border-t border-slate-100 p-4"
              >
                <input
                  className="input py-2"
                  placeholder="New list name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
                <button type="submit" disabled={busy || !newListName.trim()} className="btn-secondary py-2">
                  Create
                </button>
              </form>
            )}
          </SectionCard>

          {canManage && contacts.length > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
              <p className="text-sm font-bold text-red-800">Danger zone</p>
              <p className="mt-0.5 text-xs text-red-700/80">Erase every contact and their message history.</p>
              <button type="button" onClick={onDeleteAll} disabled={busy} className="btn-danger mt-3 py-2">
                Delete all contacts
              </button>
            </div>
          )}
        </div>
      </div>

      <Drawer open={canManage && creating} onClose={() => setCreating(false)} title="Add contact" subtitle="Include the country code, e.g. +91">
        {creating && (
          <AddContactForm
            fields={fields}
            onCancel={() => setCreating(false)}
            onAdded={(contact) => {
              setContacts((prev) => [contact, ...prev]);
              setCreating(false);
              setNotice(`Added ${contactHandle(contact)}.`);
            }}
          />
        )}
      </Drawer>

      <Drawer open={canManage && importing} onClose={() => setImporting(false)} title="Upload contacts" subtitle="A CSV file becomes a new list">
        {importing && (
          <ImportForm
            fields={fields}
            onCancel={() => setImporting(false)}
            onImported={(list, added) => {
              setLists((prev) => [list, ...prev]);
              if (added > 0) {
                // Cheapest way to pick up rows the import created server-side.
                listContacts(CONTACT_FETCH_LIMIT).then(setContacts).catch(() => undefined);
              }
            }}
          />
        )}
      </Drawer>
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
      <span className="text-sm text-slate-600">Add to</span>
      <select className="input w-auto py-1.5" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="__new__">a new list…</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {creatingNew && (
        <input
          className="input w-44 py-1.5"
          placeholder="List name"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
        />
      )}
      <button
        type="button"
        onClick={() => onAdd(creatingNew ? null : target, newListName.trim())}
        disabled={busy || (creatingNew && newListName.trim().length === 0)}
        className="btn-primary py-1.5"
      >
        Add {count}
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
    <div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4">
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
    </div>
  );
}

function ImportForm({
  fields,
  onImported,
  onCancel,
}: {
  fields: CustomFieldDefinition[];
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
  const activeFields = fields.filter((field) => field.isActive);

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
    <div>
      <p className="text-sm text-slate-500">
        CSV with a header row, e.g. <code className="rounded bg-slate-100 px-1">phone,name</code>. Phone
        numbers should include the country code.
      </p>
      {activeFields.length > 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Add a column for any of your contact fields and it is imported too:{" "}
          {activeFields.map((field, index) => (
            <span key={field.id}>
              {index > 0 && ", "}
              <code className="rounded bg-slate-100 px-1">{field.key}</code>
            </span>
          ))}
          . A contact already on file keeps every answer the file does not carry. Download CSV gives you
          this exact layout.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          Add your own questions under Contact Fields and their columns will be imported here too.
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="field-label">List name</span>
          <input required className="input" value={listName} onChange={(e) => setListName(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">CSV file</span>
          <input
            ref={fileInputRef}
            required
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:border-brand-300"
          />
          {fileName && <span className="mt-1 block text-xs text-slate-500">{fileName} loaded</span>}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <div className="space-y-1 text-sm">
            <p className="text-brand-800">
              Imported {result.newContacts} new contact(s), linked {result.existingContactsLinked}{" "}
              existing, topped up {result.updatedContacts}. Skipped {result.invalidRowCount} invalid and{" "}
              {result.duplicateInFileCount} duplicate row(s).
            </p>
            {result.customFieldColumns.length > 0 && (
              <p className="text-slate-600">
                Imported into: {result.customFieldColumns.map((c) => c.field).join(", ")}.
              </p>
            )}
            {result.ignoredColumns.length > 0 && (
              <p className="text-amber-700">
                No contact field matches {result.ignoredColumns.join(", ")}, so those columns were
                skipped.
              </p>
            )}
            {result.invalidValueCount > 0 && (
              <p className="text-amber-700">
                {result.invalidValueCount} value(s) a field could not hold were left out; the rows
                themselves were kept.
                {result.sampleIssues.length > 0 && ` For example — ${result.sampleIssues[0]}`}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting || !csvText} className="btn-primary">
            {submitting ? "Importing…" : "Import"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            {result ? "Done" : "Cancel"}
          </button>
        </div>
      </form>
    </div>
  );
}
