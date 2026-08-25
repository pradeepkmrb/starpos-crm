"use client";

import type { DailyPoint } from "../../../lib/api";

/**
 * Dependency-free chart: each day is a stacked bar (delivered / read / failed
 * / still-just-sent) plus a thin inbound bar underneath. Scaled to the
 * busiest day in the series so bars stay comparable across the window.
 */
export function DailyBarChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">No messages in this period yet.</p>;
  }

  const maxOutbound = Math.max(1, ...data.map((d) => d.sent));
  const maxInbound = Math.max(1, ...data.map((d) => d.inbound));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-full items-end gap-2" style={{ height: 180 }}>
        {data.map((d) => {
          const read = d.read;
          const deliveredOnly = Math.max(0, d.delivered - d.read);
          const failed = d.failed;
          const pending = Math.max(0, d.sent - d.delivered - d.failed);
          const total = d.sent || 1;
          const scale = (n: number) => (n / maxOutbound) * 140;

          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col-reverse" style={{ height: 140 }}>
                <Segment height={scale(pending)} className="bg-slate-200" title={`${pending} sent`} />
                <Segment height={scale(deliveredOnly)} className="bg-brand-400" title={`${deliveredOnly} delivered`} />
                <Segment height={scale(read)} className="bg-brand-800" title={`${read} read`} />
                <Segment height={scale(failed)} className="bg-red-500" title={`${failed} failed`} />
              </div>
              <div
                className="w-2/3 rounded-sm bg-sky-300"
                style={{ height: Math.max(2, (d.inbound / maxInbound) * 20) }}
                title={`${d.inbound} received`}
              />
              <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
              <span className="sr-only">{total} total outbound</span>
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function Segment({ height, className, title }: { height: number; className: string; title: string }) {
  if (height <= 0) return null;
  return <div className={`w-full ${className}`} style={{ height }} title={title} />;
}

function Legend() {
  const items: [string, string][] = [
    ["bg-brand-800", "Read"],
    ["bg-brand-400", "Delivered"],
    ["bg-slate-200", "Sent"],
    ["bg-red-500", "Failed"],
    ["bg-sky-300", "Received (inbound)"],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
