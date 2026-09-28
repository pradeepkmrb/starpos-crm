"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACTIVITY_TYPE_LABELS, roleAtLeast, type TenantRole } from "@starpos-crm/shared";
import { ApiError, type Activity, getAccessToken, listActivities, me, updateActivity } from "../../../lib/api";
import { addDays, formatWhen, localInputToIso, startOfDay } from "../../../lib/activities";
import { StatusBadge } from "../leads/LeadActivities";
import { ActivityIcon } from "../../../components/ActivityIcon";
import { CheckIcon } from "../../../components/icons";

type Tab = "today" | "upcoming" | "overdue";
const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
];

/** Scheduled-activity windows in the viewer's own time zone. */
function windowFor(tab: Tab, now = new Date()): { from?: string; to?: string } {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  if (tab === "today") return { from: today.toISOString(), to: tomorrow.toISOString() };
  if (tab === "upcoming") return { from: tomorrow.toISOString() };
  return { to: today.toISOString() };
}

/**
 * Everything scheduled and not yet done — calls to make, visits and demos to
 * attend, follow-ups to chase — split into today, later and overdue.
 */
export default function FollowUpsPage() {
  const router = useRouter();
  const [role, setRole] = useState<TenantRole | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [scope, setScope] = useState<"me" | "everyone">("me");
  const [lists, setLists] = useState<Record<Tab, Activity[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [newTime, setNewTime] = useState("");

  const canEdit = role ? roleAtLeast(role, "agent") : false;

  const load = useCallback(async () => {
    const owner = scope === "me" ? "me" : undefined;
    const [today, upcoming, overdue] = await Promise.all(
      TABS.map(({ key }) => listActivities({ status: "scheduled", owner, ...windowFor(key) })),
    );
    setLists({ today, upcoming, overdue });
  }, [scope]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [meRes] = await Promise.all([me(), load()]);
        setRole(meRes.role);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load follow-ups");
      }
    })();
  }, [router, load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveReschedule(activity: Activity) {
    const at = localInputToIso(newTime);
    if (!at) {
      setError("Pick a new date and time.");
      return;
    }
    await run(() => updateActivity(activity.id, { scheduledAt: at }));
    setRescheduling(null);
    setNewTime("");
  }

  const rows = lists?.[tab] ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="mt-1 text-sm text-slate-500">
            Calls, visits, demos and follow-ups still to do. Schedule new ones from a lead&apos;s Activity
            section on the{" "}
            <Link href="/dashboard/leads" className="font-medium text-brand-800 underline">
              Leads
            </Link>{" "}
            page.
          </p>
        </div>
        <select
          className="input w-40"
          value={scope}
          aria-label="Whose follow-ups"
          onChange={(e) => setScope(e.target.value as "me" | "everyone")}
        >
          <option value="me">Mine</option>
          <option value="everyone">Everyone&apos;s</option>
        </select>
      </div>

      <div className="mt-6 inline-flex rounded-2xl border border-slate-200 bg-white p-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key ? "bg-brand-600 text-white shadow-brand" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
            {lists && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  tab === key
                    ? "bg-white/20 text-white"
                    : key === "overdue" && lists.overdue.length > 0
                      ? "bg-red-100 text-red-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {lists[key].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!lists ? (
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card mt-5 flex flex-col items-center px-6 py-14 text-center">
          <span className="icon-chip h-14 w-14 bg-brand-50 text-brand-600">
            <CheckIcon className="h-7 w-7" />
          </span>
          <p className="mt-4 text-base font-bold text-slate-900">
            {tab === "overdue" ? "Nothing overdue" : tab === "today" ? "Nothing scheduled for today" : "Nothing coming up"}
          </p>
          <p className="mt-1 text-sm text-slate-500">Schedule a call, visit or demo from any lead.</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((activity) => (
            <li key={activity.id} className="card card-hover px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-4">
                  <ActivityIcon type={activity.type} />
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-slate-900">
                      {ACTIVITY_TYPE_LABELS[activity.type]} · {activity.lead.company || activity.lead.name}
                    </span>
                    {activity.lead.company && <span className="text-slate-500">{activity.lead.name}</span>}
                    <StatusBadge activity={activity} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatWhen(activity.scheduledAt)}
                    {activity.lead.phone ? ` · ${activity.lead.phone}` : ""}
                    {scope === "everyone" && activity.owner
                      ? ` · ${activity.owner.name ?? activity.owner.email}`
                      : ""}
                  </p>
                  {activity.notes && <p className="mt-1 text-sm text-slate-700">{activity.notes}</p>}
                  {activity.lead.address && <p className="mt-1 text-xs text-slate-500">{activity.lead.address}</p>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => void run(() => updateActivity(activity.id, { status: "completed" }))}
                    >
                      Mark done
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        setRescheduling(rescheduling === activity.id ? null : activity.id);
                        setNewTime("");
                      }}
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void run(() => updateActivity(activity.id, { status: "cancelled" }))}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              {rescheduling === activity.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="input w-60"
                    type="datetime-local"
                    value={newTime}
                    disabled={busy}
                    aria-label="New date and time"
                    onChange={(e) => setNewTime(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => void saveReschedule(activity)}
                  >
                    Save
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
