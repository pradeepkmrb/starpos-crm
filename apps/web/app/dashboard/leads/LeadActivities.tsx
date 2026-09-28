"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  formatDistance,
  outcomeLabel,
  type ActivityType,
} from "@starpos-crm/shared";
import {
  ApiError,
  type Activity,
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
} from "../../../lib/api";
import {
  activityTime,
  formatDuration,
  formatWhen,
  isOverdue,
  localInputToIso,
  mapsLink,
} from "../../../lib/activities";

/**
 * A lead's timeline: everything logged against it, newest first, with a
 * quick form to log something that just happened or schedule a follow-up.
 */
export function LeadActivities({
  leadId,
  canEdit,
  onLeadChanged,
}: {
  leadId: string;
  canEdit: boolean;
  /** Logging an activity can move the lead's stage, so the table needs a refresh. */
  onLeadChanged: () => void;
}) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<ActivityType>("call");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      setActivities(await listActivities({ leadId }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load activity");
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      onLeadChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const schedule = when === "later" && type !== "note";

  async function onAdd() {
    const at = schedule ? localInputToIso(scheduledAt) : null;
    if (schedule && !at) {
      setError("Pick a date and time to schedule it for.");
      return;
    }
    await run(() =>
      createActivity({
        leadId,
        type,
        status: schedule ? "scheduled" : "completed",
        scheduledAt: at,
        notes: notes.trim() || null,
      }),
    );
    setNotes("");
    setScheduledAt("");
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>

      {canEdit && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[140px_170px_1fr_auto] sm:items-start">
          <select
            className="input"
            value={type}
            disabled={busy}
            aria-label="Activity type"
            onChange={(e) => setType(e.target.value as ActivityType)}
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {type === "note" ? (
            <span className="self-center text-sm text-slate-500">Saved as done</span>
          ) : (
            <div className="space-y-2">
              <select
                className="input"
                value={when}
                disabled={busy}
                aria-label="When"
                onChange={(e) => setWhen(e.target.value as "now" | "later")}
              >
                <option value="now">Done just now</option>
                <option value="later">Schedule for…</option>
              </select>
              {when === "later" && (
                <input
                  className="input"
                  type="datetime-local"
                  value={scheduledAt}
                  disabled={busy}
                  aria-label="Scheduled for"
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              )}
            </div>
          )}
          <input
            className="input"
            placeholder={schedule ? "What's it for? (optional)" : "What happened? (optional)"}
            value={notes}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void onAdd()}>
            {schedule ? "Schedule" : "Log"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {activities === null ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nothing logged yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {activities.map((activity) => (
            <li key={activity.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-900">{ACTIVITY_TYPE_LABELS[activity.type]}</span>
                  <StatusBadge activity={activity} />
                  <span className="text-slate-500">{formatWhen(activityTime(activity))}</span>
                  {activity.owner && (
                    <span className="text-slate-500">· {activity.owner.name ?? activity.owner.email}</span>
                  )}
                </div>
                {canEdit && (activity.status === "scheduled" || activity.status === "in_progress") && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void run(() => updateActivity(activity.id, { status: "completed" }))}
                    >
                      Mark done
                    </button>
                    {activity.status === "scheduled" && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => void run(() => updateActivity(activity.id, { status: "cancelled" }))}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
                {canEdit && (activity.status === "completed" || activity.status === "cancelled") && (
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-600"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Delete this entry?")) void run(() => deleteActivity(activity.id));
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              {activity.type === "visit" && activity.startedAt && <VisitDetails activity={activity} />}
              {(activity.notes || activity.outcome) && (
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                  {activity.outcome ? <span className="font-medium">{outcomeLabel(activity.outcome)}{activity.notes ? ": " : ""}</span> : null}
                  {activity.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StatusBadge({ activity }: { activity: Activity }) {
  if (activity.status === "in_progress") return <span className="badge badge-warning">On site now</span>;
  if (activity.status === "completed") return <span className="badge badge-success">Done</span>;
  if (activity.status === "cancelled") return <span className="badge badge-neutral">Cancelled</span>;
  if (isOverdue(activity)) return <span className="badge badge-danger">Overdue</span>;
  return <span className="badge badge-warning">Scheduled</span>;
}

/** Check-in facts for a visit: when, for how long, and how close to the lead. */
export function VisitDetails({ activity }: { activity: Activity }) {
  return (
    <p className="mt-1 text-xs text-slate-500">
      Checked in {activity.startedAt ? formatWhen(activity.startedAt) : "—"}
      {activity.status === "completed" ? ` · ${formatDuration(activity.durationSeconds)} on site` : ""}
      {activity.distanceMeters !== null
        ? ` · ${formatDistance(activity.distanceMeters)} from the lead`
        : " · pinned the lead's location"}
      {activity.latitude !== null && activity.longitude !== null && (
        <>
          {" · "}
          <a
            href={mapsLink(activity.latitude, activity.longitude)}
            target="_blank"
            rel="noreferrer"
            className="text-brand-800 underline"
          >
            map
          </a>
        </>
      )}
    </p>
  );
}
