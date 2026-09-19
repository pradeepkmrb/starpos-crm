"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

/**
 * A panel that slides in from the right over the page; Escape or the backdrop
 * closes it. Rendered into <body> through a portal, so the page's own layout
 * (e.g. a space-y-* parent adding margin) can't shift it.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full ${width} animate-slide-in flex-col bg-white shadow-pop`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold text-slate-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
