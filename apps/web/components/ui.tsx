import type { ReactNode } from "react";
import type { HomeIcon } from "./icons";

type Icon = typeof HomeIcon;

/** Soft background + strong foreground pairs for icon chips and stat accents. */
export const TONES = {
  brand: "bg-brand-50 text-brand-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-500",
} as const;
export type Tone = keyof typeof TONES;

/** The top of every dashboard page: icon chip, title, one line of context, and the page's main actions. */
export function PageHeader({
  icon: IconComponent,
  tone = "brand",
  title,
  subtitle,
  actions,
}: {
  icon: Icon;
  tone?: Tone;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <span className={`icon-chip h-12 w-12 rounded-2xl ${TONES[tone]}`}>
          <IconComponent className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle max-w-2xl">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A friendly "nothing here yet" block: what this is for, and the first thing to do. */
export function EmptyState({
  icon: IconComponent,
  tone = "brand",
  title,
  text,
  action,
  compact,
}: {
  icon: Icon;
  tone?: Tone;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center px-6 text-center ${compact ? "py-8" : "py-14"}`}>
      <span className={`icon-chip h-14 w-14 rounded-2xl ${TONES[tone]}`}>
        <IconComponent className="h-7 w-7" />
      </span>
      <p className="mt-4 font-bold text-slate-900">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** One headline number with an icon chip. */
export function StatTile({
  icon: IconComponent,
  tone = "brand",
  label,
  value,
  sub,
}: {
  icon: Icon;
  tone?: Tone;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <span className={`icon-chip h-9 w-9 ${TONES[tone]}`}>
          <IconComponent className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** A card with a titled header row. */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A numbered setup step that shows as done (ticked) or to do (with a link). */
export function SetupStep({ n, done, title, children }: { n: number; done: boolean; title: string; children?: ReactNode }) {
  return (
    <li className={`flex gap-3 rounded-2xl border p-4 ${done ? "border-brand-100 bg-brand-50/50" : "border-slate-200 bg-white"}`}>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0">
        <p className={`font-semibold ${done ? "text-brand-800" : "text-slate-900"}`}>{title}</p>
        {children && !done && <div className="mt-0.5 text-sm text-slate-500">{children}</div>}
      </div>
    </li>
  );
}
