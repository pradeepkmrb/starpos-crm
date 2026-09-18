"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistance, outcomeLabel } from "@digitel/shared";
import { ApiError, type Activity, type Member, getAccessToken, listActivities, listMembers } from "../../../lib/api";
import { addDays, formatDuration, mapsLink, startOfDay } from "../../../lib/activities";

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Where the field team has been on a given day: every visit check-in, how
 * long it lasted, how close to the lead it was, and what came of it.
 */
export default function VisitsPage() {
  const router = useRouter();
  const [day, setDay] = useState(() => toDateInput(new Date()));
  const [rep, setRep] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [visits, setVisits] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const start = startOfDay(new Date(`${day}T00:00:00`));
    setVisits(
      await listActivities({
        type: "visit",
        owner: rep || undefined,
        startedFrom: start.toISOString(),
        startedTo: addDays(start, 1).toISOString(),
        limit: 500,
      }),
    );
  }, [day, rep]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    listMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [router]);

  useEffect(() => {
    setVisits(null);
    load().catch((err) => {
      if (err instanceof ApiError && err.status === 401) router.push("/login");
      else setError(err instanceof ApiError ? err.message : "Could not load visits");
    });
  }, [load, router]);

  const stats = useMemo(() => {
    const list = visits ?? [];
    const done = list.filter((v) => v.status === "completed");
    const seconds = done.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0);
    return {
      total: list.length,
      onSiteNow: list.filter((v) => v.status === "in_progress").length,
      reps: new Set(list.map((v) => v.ownerUserId)).size,
      averageSeconds: done.length ? Math.round(seconds / done.length) : null,
    };
  }, [visits]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Visits</h1>
          <p className="mt-1 text-sm text-slate-500">
            Check-ins from the mobile app. A check-in only goes through within 200 m of the lead&apos;s location.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-44"
            type="date"
            value={day}
            aria-label="Day"
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
          <select className="input w-48" value={rep} aria-label="Rep" onChange={(e) => setRep(e.target.value)}>
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name ?? m.user.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Visits" value={String(stats.total)} />
        <Stat label="On site now" value={String(stats.onSiteNow)} />
        <Stat label="Reps in the field" value={String(stats.reps)} />
        <Stat label="Average visit" value={formatDuration(stats.averageSeconds)} />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!visits ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : visits.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No visits checked in on this day.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Rep</th>
                <th className="px-4 py-3 font-semibold">Lead</th>
                <th className="px-4 py-3 font-semibold">In</th>
                <th className="px-4 py-3 font-semibold">Out</th>
                <th className="px-4 py-3 font-semibold">Time on site</th>
                <th className="px-4 py-3 font-semibold">Distance</th>
                <th className="px-4 py-3 font-semibold">Result</th>
                <th className="px-4 py-3 font-semibold">Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visits.map((v) => (
                <tr key={v.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{v.owner ? (v.owner.name ?? v.owner.email) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{v.lead.company || v.lead.name}</div>
                    {v.lead.address && <div className="text-xs text-slate-500">{v.lead.address}</div>}
                    {v.title && <div className="text-xs text-slate-500">{v.title}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatClock(v.startedAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {v.status === "in_progress" ? (
                      <span className="badge badge-warning">On site now</span>
                    ) : (
                      <span className="text-slate-700">{formatClock(v.completedAt)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatDuration(v.durationSeconds)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    {v.distanceMeters !== null ? formatDistance(v.distanceMeters) : "First visit"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {v.outcome ? <div className="font-medium">{outcomeLabel(v.outcome)}</div> : null}
                    {v.notes ? <div className="text-xs text-slate-500">{v.notes}</div> : null}
                    {!v.outcome && !v.notes ? "—" : null}
                  </td>
                  <td className="px-4 py-3">
                    {v.latitude !== null && v.longitude !== null ? (
                      <a
                        href={mapsLink(v.latitude, v.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-800 underline"
                      >
                        Check-in
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
