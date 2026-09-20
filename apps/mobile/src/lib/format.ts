import { Linking } from "react-native";

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Today and this month in the phone's own time zone, for the home screen. */
export function localWindow(now = new Date()) {
  const dayStart = startOfDay(now);
  return { dayStart, dayEnd: addDays(dayStart, 1), monthStart: new Date(now.getFullYear(), now.getMonth(), 1) };
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** "Today, 10:30 am" / "Tomorrow, 9:00 am" / "26 Sep, 11:00 am". */
export function formatWhen(iso: string | null, now = new Date()): string {
  if (!iso) return "No time set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dayDiff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const time = formatTime(d);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** ₹5,00,000 — Indian digit grouping, no paise. */
export function formatRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function isOverdue(activity: { status: string; scheduledAt: string | null }, now = new Date()): boolean {
  return (
    activity.status === "scheduled" &&
    !!activity.scheduledAt &&
    new Date(activity.scheduledAt).getTime() < startOfDay(now).getTime()
  );
}

/** Digits only, for tel: and wa.me links. */
export function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function openDialer(phone: string) {
  return Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
}

export function openWhatsApp(phone: string) {
  return Linking.openURL(`https://wa.me/${digits(phone)}`);
}

export function openMaps(lead: { address: string | null; latitude?: number | null; longitude?: number | null }) {
  const query =
    lead.latitude !== null && lead.latitude !== undefined && lead.longitude !== null && lead.longitude !== undefined
      ? `${lead.latitude},${lead.longitude}`
      : (lead.address ?? "");
  return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
}
