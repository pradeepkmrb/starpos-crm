"use client";

import { useEffect, useRef, useState } from "react";
import { type Campaign, type CampaignDetail, getCampaign } from "../../../lib/api";

const STATUS_BADGE: Record<string, string> = {
  sending: "badge-warning",
  completed: "badge-success",
  failed: "badge-danger",
  draft: "badge-neutral",
  scheduled: "badge-neutral",
};

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
  const statusBadge = STATUS_BADGE[campaign.status] ?? "badge-neutral";

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-medium text-slate-900">
            {campaign.channel.displayPhoneNumber} → {campaign.targetList.name}
          </p>
          <p className="text-xs text-slate-500">
            sent {stats.sent ?? 0} · delivered {stats.delivered ?? 0} · read {stats.read ?? 0} · failed{" "}
            {stats.failed ?? 0} · queued {stats.queued ?? 0}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${statusBadge}`}>{campaign.status}</span>
          <button onClick={toggleExpanded} className="btn-secondary">
            {expanded ? "Hide" : "View"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4">
          {!detail ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {detail.recipients.map((r) => (
                <li key={r.id} className="flex justify-between py-2">
                  <span className="text-slate-700">{r.contact.name ?? r.contact.whatsappNumber}</span>
                  <span className={r.status === "failed" ? "text-red-600" : "text-slate-500"}>
                    {r.status}
                    {r.error ? ` — ${r.error}` : ""}
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
