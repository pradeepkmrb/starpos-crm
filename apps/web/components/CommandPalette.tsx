"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, SearchIcon } from "./icons";
import { announceQuickAction, type NavItem } from "./nav";

/**
 * Ctrl+K / Cmd+K: jump to any page or start a quick action by typing a few
 * letters. Arrow keys move, Enter opens, Escape closes.
 */
export function CommandPalette({
  open,
  onClose,
  pages,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  pages: NavItem[];
  actions: NavItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tag = (items: NavItem[], group: string) => items.map((item) => ({ ...item, group }));
    const all = [...tag(actions, "Quick actions"), ...tag(pages, "Go to")];
    if (!q) return all;
    return all.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(q));
  }, [query, pages, actions]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
    announceQuickAction(href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/40 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <SearchIcon className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && results[cursor]) {
                go(results[cursor].href);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search pages and actions…"
            className="h-14 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-400">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matches</li>}
          {results.map((item, i) => {
            const Icon = item.icon;
            const showGroup = i === 0 || results[i - 1].group !== item.group;
            return (
              <li key={`${item.group}-${item.href}`}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(item.href)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${
                    i === cursor ? "bg-brand-50 text-brand-800" : "text-slate-700"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  {i === cursor && <ArrowRightIcon className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
