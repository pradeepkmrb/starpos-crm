import type { ActivityType } from "@starpos-crm/shared";
import { CalendarIcon, ChatIcon, MapPinIcon, PhoneIcon, PresentationIcon } from "./icons";

const CHIPS: Record<ActivityType, { icon: typeof PhoneIcon; className: string }> = {
  call: { icon: PhoneIcon, className: "bg-red-50 text-red-600" },
  visit: { icon: MapPinIcon, className: "bg-amber-50 text-amber-600" },
  demo: { icon: PresentationIcon, className: "bg-sky-50 text-sky-600" },
  follow_up: { icon: CalendarIcon, className: "bg-violet-50 text-violet-600" },
  note: { icon: ChatIcon, className: "bg-slate-100 text-slate-600" },
};

/** The coloured icon chip for an activity type — the same colours as the mobile app. */
export function ActivityIcon({ type, size = "md" }: { type: ActivityType; size?: "sm" | "md" }) {
  const chip = CHIPS[type];
  const Icon = chip.icon;
  return (
    <span className={`icon-chip ${size === "sm" ? "h-9 w-9" : "h-11 w-11"} ${chip.className}`}>
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}
