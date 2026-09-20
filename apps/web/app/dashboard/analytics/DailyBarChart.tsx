"use client";

import type { DailyPoint } from "../../../lib/api";

const EMPTY = { sent: 0, delivered: 0, read: 0, failed: 0, inbound: 0 };

/** Every day of the window, oldest first — days without traffic become empty bars instead of disappearing. */
function fillDays(data: DailyPoint[], days: number): DailyPoint[] {
  const byDate = new Map(data.map((d) => [d.date, d]));
  const out: DailyPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push(byDate.get(key) ?? ({ date: key, ...EMPTY } as DailyPoint));
  }
  return out;
}

/**
 * Dependency-free chart: each day is a stacked bar (read / delivered / failed
 * / still-just-sent) with a thin inbound bar beside it, scaled to the busiest
 * day so bars stay comparable across the window.
 */
export function DailyBarChart({ data, days }: { data: DailyPoint[]; days: number }) {
  const series = fillDays(data, days);
  const max = Math.max(1, ...series.map((d) => Math.max(d.sent, d.inbound)));
  // A round-ish top for the axis so the gridlines read as real numbers.
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const H = 180;
  const scale = (n: number) => (n / top) * H;
  const labelEvery = days <= 14 ? 1 : days <= 30 ? 3 : 10;

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex w-8 flex-col justify-between text-right text-[10px] text-slate-400" style={{ height: H }}>
          {[4, 3, 2, 1, 0].map((i) => (
            <span key={i} className="-translate-y-1.5">
              {step * i}
            </span>
          ))}
        </div>
        <div className="relative flex-1 overflow-x-auto">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-t border-dashed border-slate-100" />
            ))}
          </div>
          <div className="relative flex min-w-full items-end justify-between gap-1" style={{ height: H }}>
            {series.map((d) => {
              const deliveredOnly = Math.max(0, d.delivered - d.read);
              const pending = Math.max(0, d.sent - d.delivered - d.failed);
              return (
                <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center gap-0.5">
                  <div className="flex w-full max-w-[22px] flex-col-reverse overflow-hidden rounded-t-md">
                    <Segment h={scale(d.read)} className="bg-brand-700" />
                    <Segment h={scale(deliveredOnly)} className="bg-brand-400" />
                    <Segment h={scale(pending)} className="bg-slate-300" />
                    <Segment h={scale(d.failed)} className="bg-red-400" />
                  </div>
                  <div className="w-1.5 rounded-t-sm bg-sky-300" style={{ height: scale(d.inbound) }} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-36 -translate-x-1/2 rounded-xl bg-ink-900 p-2.5 text-[11px] text-white shadow-pop group-hover:block">
                    <p className="font-bold">{new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    <p>Sent {d.sent}</p>
                    <p>Delivered {d.delivered}</p>
                    <p>Read {d.read}</p>
                    {d.failed > 0 && <p className="text-red-300">Failed {d.failed}</p>}
                    <p className="text-sky-300">Received {d.inbound}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between gap-1">
            {series.map((d, i) => (
              <span key={d.date} className="flex-1 text-center text-[10px] text-slate-400">
                {i % labelEvery === 0 || i === series.length - 1 ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Legend />
    </div>
  );
}

function Segment({ h, className }: { h: number; className: string }) {
  if (h <= 0) return null;
  return <div className={`w-full ${className}`} style={{ height: h }} />;
}

function Legend() {
  const items: [string, string][] = [
    ["bg-brand-700", "Read"],
    ["bg-brand-400", "Delivered"],
    ["bg-slate-300", "Sent"],
    ["bg-red-400", "Failed"],
    ["bg-sky-300", "Received"],
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
