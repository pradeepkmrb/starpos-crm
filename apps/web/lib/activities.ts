import type { Activity } from "./api";

/** "Today, 10:30 AM" / "Tomorrow, 9:00 AM" / "26 Sep, 11:00 AM". */
export function formatWhen(iso: string | null, now = new Date()): string {
  if (!iso) return "No time set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dayDiff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

/** When the thing happened, or is due: what a timeline row should show. */
export function activityTime(activity: Activity): string | null {
  return activity.status === "completed" ? (activity.completedAt ?? activity.createdAt) : activity.scheduledAt;
}

export function isOverdue(activity: Activity, now = new Date()): boolean {
  return (
    activity.status === "scheduled" &&
    !!activity.scheduledAt &&
    new Date(activity.scheduledAt).getTime() < startOfDay(now).getTime()
  );
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** A datetime-local input value (local time, no zone) as an ISO instant. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "18 min" / "1 h 05 min" / "45 s". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
