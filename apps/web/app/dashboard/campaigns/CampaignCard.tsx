"use client";

import { useEffect, useRef, useState } from "react";
import { type Campaign, type CampaignDetail, getCampaign } from "../../../lib/api";
import { ChevronDownIcon, MegaphoneIcon } from "../../../components/icons";

const STATUS_BADGE: Record<string, string> = {
  sending: "badge-warning",
  completed: "badge-success",
  failed: "badge-danger",
  draft: "badge-neutral",
  scheduled: "badge-neutral",
};

const RECIPIENT_BADGE: Record<string, string> = {
  read: "badge-success",
  delivered: "badge-info",
  sent: "badge-neutral",
  queued: "badge-neutral",
  pending: "badge-neutral",
  failed: "badge-danger",
};

/** Where each recipient's message got to, as stacked segments of one bar. */
const SEGMENTS = [
  { key: "read", label: "Read", color: "bg-brand-600" },
  { key: "delivered", label: "Delivered", color: "bg-brand-300" },
  { key: "sent", label: "Sent", color: "bg-sky-300" },
  { key: "queued", label: "Queued", color: "bg-slate-300" },
  { key: "failed", label: "Failed", color: "bg-red-400" },
] as const;

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const d = await getCampaign(campaign.id);
    setDetail(d);
    if (d.status !== "sending" && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      refresh();
      if (campaign.status === "sending") {
        pollRef.current = setInterval(refresh, 3000);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const stats = campaign.recipientStats ?? {};
  const counts = { ...stats, queued: (stats.queued ?? 0) + (stats.pending ?? 0) } as Record<string, number>;
  const total = SEGMENTS.reduce((sum, s) => sum + (counts[s.key] ?? 0), 0);
  const statusBadge = STATUS_BADGE[campaign.status] ?? "badge-neutral";

  return (
    <div>
      <button type="button" onClick={toggleExpanded} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50">
        <span className="icon-chip bg-brand-50 text-brand-600">
          <MegaphoneIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold text-slate-900">{campaign.template?.name ?? "Broadcast"}</p>
            <span className={`badge ${statusBadge} capitalize`}>{campaign.status}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            To {campaign.targetList.name} · from {campaign.channel.displayPhoneNumber ?? "WhatsApp"} ·{" "}
            {new Date(campaign.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
            {total > 0 &&
              SEGMENTS.map((s) =>
                counts[s.key] ? (
                  <div key={s.key} className={s.color} style={{ width: `${(counts[s.key] / total) * 100}%` }} />
                ) : null,
              )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {SEGMENTS.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${s.color}`} />
                {s.label} <span className="font-semibold text-slate-700">{counts[s.key] ?? 0}</span>
              </span>
            ))}
          </div>
        </div>
        <ChevronDownIcon className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          {!detail ? (
            <div className="skeleton h-10 rounded-xl" />
          ) : detail.recipients.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">No recipients.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
              {detail.recipients.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-slate-700">{r.contact.name ?? r.contact.whatsappNumber ?? "—"}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    {r.error && <span className="truncate text-xs text-red-600">{r.error}</span>}
                    <span className={`badge ${RECIPIENT_BADGE[r.status] ?? "badge-neutral"} capitalize`}>{r.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
