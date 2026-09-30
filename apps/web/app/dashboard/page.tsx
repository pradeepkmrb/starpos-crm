"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ACTIVITY_TYPE_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  canEdit,
  hasAccess,
  type LeadStatus,
  type Permissions,
} from "@starpos-crm/shared";
import {
  ApiError,
  type AnalyticsOverview,
  type AuthUser,
  type FieldSummary,
  type LeadSummary,
  clearTokens,
  getAccessToken,
  getAnalyticsOverview,
  getFieldSummary,
  getLeadSummary,
  listCampaigns,
  listContacts,
  me,
} from "../../lib/api";
import { formatWhen, isOverdue } from "../../lib/activities";
import { ActivityIcon } from "../../components/ActivityIcon";
import {
  ArrowRightIcon,
  CalendarIcon,
  FunnelIcon,
  MapPinIcon,
  MegaphoneIcon,
  PhoneIcon,
  PlusIcon,
  PresentationIcon,
  ReceiptIcon,
  TrendUpIcon,
  TrophyIcon,
  UsersIcon,
} from "../../components/icons";

/** Each part is null when the person's role doesn't include the menu it comes from. */
interface HomeData {
  user: AuthUser;
  permissions: Permissions;
  field: FieldSummary | null;
  leads: LeadSummary | null;
  analytics: AnalyticsOverview | null;
  audience: number | null;
  broadcasts: number | null;
}

const STAGE_BAR: Record<LeadStatus, string> = {
  new: "bg-sky-400",
  contacted: "bg-indigo-400",
  interested: "bg-amber-400",
  qualified: "bg-leaf-400",
  demo_scheduled: "bg-violet-400",
  proposal: "bg-brand-400",
  won: "bg-brand-600",
  lost: "bg-slate-300",
};

function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const meRes = await me();
        const p = meRes.permissions;
        const when = <T,>(allowed: boolean, load: () => Promise<T>) => (allowed ? load() : Promise.resolve(null));
        const [field, leads, analytics, campaigns, contacts] = await Promise.all([
          // Roles that see all records get the whole team's numbers; others their own.
          when(hasAccess(p, ["leads", "follow_ups", "visits", "targets"], "view"), () =>
            getFieldSummary(meRes.dataScope === "all" ? "team" : "me"),
          ),
          when(hasAccess(p, ["leads"], "view"), getLeadSummary),
          when(hasAccess(p, ["analytics"], "view"), () => getAnalyticsOverview(30)),
          when(hasAccess(p, ["broadcasts"], "view"), listCampaigns),
          when(hasAccess(p, ["audience"], "view"), listContacts),
        ]);
        setData({
          user: meRes.user,
          permissions: p,
          field,
          leads,
          analytics,
          audience: contacts?.length ?? null,
          broadcasts: campaigns?.length ?? null,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Couldn't load your dashboard");
      }
    })();
  }, [router]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <HomeSkeleton />;

  const { field, leads, analytics, permissions } = data;
  const firstName = data.user.name?.split(" ")[0] ?? "";
  const nothingToShow = !field && !leads && !analytics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="page-title mt-1">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <div className="flex gap-2">
          {canEdit(permissions, "leads") && (
            <Link href="/dashboard/leads?new=1" className="btn-secondary">
              <PlusIcon className="h-4 w-4" />
              Add lead
            </Link>
          )}
          {canEdit(permissions, "quotations") && (
            <Link href="/dashboard/quotations?new=1" className="btn-secondary">
              <ReceiptIcon className="h-4 w-4" />
              New quotation
            </Link>
          )}
          {canEdit(permissions, "broadcasts") && (
            <Link href="/dashboard/campaigns" className="btn-primary">
              <MegaphoneIcon className="h-4 w-4" />
              New broadcast
            </Link>
          )}
        </div>
      </div>

      {nothingToShow && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Welcome! Use the menu on the left to get to the parts of StarPOS CRM your role includes.
        </div>
      )}

      {field && <SalesOverview field={field} />}

      {(leads || field) && (
        <div className="grid gap-4 lg:grid-cols-5">
          {leads && (
            <section className={`card p-6 ${field ? "lg:col-span-3" : "lg:col-span-5"}`}>
              <SectionHeader title="Pipeline" href="/dashboard/leads" linkLabel="Open leads" />
              <PipelineBars summary={leads} />
            </section>
          )}
          {field && <TodaysPlan field={field} wide={!leads} />}
        </div>
      )}

      {analytics && (
        <section className="card p-6">
          <SectionHeader title="WhatsApp · last 30 days" href="/dashboard/analytics" linkLabel="Analytics" />
          <div className="mt-4 grid gap-6 lg:grid-cols-4">
            <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
              <MiniStat label="Delivery rate" value={`${Math.round(analytics.totals.deliveryRate * 100)}%`} />
              <MiniStat label="Read rate" value={`${Math.round(analytics.totals.readRate * 100)}%`} />
              {data.audience !== null && (
                <MiniStat label="Audience" value={data.audience.toLocaleString("en-IN")} icon={UsersIcon} />
              )}
              {data.broadcasts !== null && <MiniStat label="Broadcasts" value={String(data.broadcasts)} icon={MegaphoneIcon} />}
            </div>
            <div className="lg:col-span-3">
              <MessagesChart analytics={analytics} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** Won this month, today's count and the month's activity KPIs. */
function SalesOverview({ field }: { field: FieldSummary }) {
  const pipelineTotal = field.month.wonValuePaise + field.openPipeline.valuePaise;
  const wonShare = pipelineTotal > 0 ? field.month.wonValuePaise / pipelineTotal : 0;
  const scopeLabel = field.scope === "team" ? "Your team" : "You";
  const target = field.targetPaise;
  const targetPct = target ? Math.round((field.month.wonValuePaise / target) * 100) : 0;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2.5xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-6 text-white shadow-brand lg:col-span-2">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-100">
              <TrophyIcon className="h-4 w-4" />
              {scopeLabel} · won this month
            </div>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">{rupees(field.month.wonValuePaise)}</p>
            <p className="mt-1 text-sm text-brand-100">
              {field.month.closings} {field.month.closings === 1 ? "deal" : "deals"} closed
            </p>
            {target ? (
              <div className="mt-6">
                <div className="flex justify-between text-xs font-medium text-brand-100">
                  <span>Target {rupees(target)}</span>
                  <span>{targetPct}%</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-white/20">
                  <div className="h-2.5 rounded-full bg-white" style={{ width: `${Math.max(2, Math.min(100, targetPct))}%` }} />
                </div>
                <p className="mt-2 text-sm">
                  {field.month.wonValuePaise >= target ? (
                    <span className="font-semibold">Target hit — well done</span>
                  ) : (
                    <>
                      <span className="font-semibold">{rupees(target - field.month.wonValuePaise)}</span>
                      <span className="text-brand-100"> to go · </span>
                    </>
                  )}
                  <span className="text-brand-100">
                    {field.month.wonValuePaise >= target ? " · " : ""}
                    {rupees(field.month.collectedPaise)} collected
                  </span>
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <div className="flex justify-between text-xs font-medium text-brand-100">
                  <span>Won vs open pipeline</span>
                  <span>{Math.round(wonShare * 100)}%</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-white/20">
                  <div className="h-2.5 rounded-full bg-white" style={{ width: `${Math.max(2, wonShare * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-semibold">{rupees(field.openPipeline.valuePaise)}</span>
                  <span className="text-brand-100"> still open across {field.openPipeline.count} leads</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Today */}
        <div className="card flex flex-col p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-500">Today</p>
            <span className="icon-chip h-9 w-9 bg-violet-50 text-violet-600">
              <CalendarIcon className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">{field.today.length}</p>
          <p className="text-sm text-slate-500">activities planned or done</p>
          <div className="mt-auto pt-5">
            {field.overdueCount > 0 ? (
              <Link
                href="/dashboard/follow-ups"
                className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                {field.overdueCount} overdue {field.overdueCount === 1 ? "follow-up" : "follow-ups"}
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            ) : (
              <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-800">
                Nothing overdue — nice work
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={PhoneIcon} tint="bg-red-50 text-red-600" label="Calls" value={field.month.calls} />
        <Kpi icon={MapPinIcon} tint="bg-amber-50 text-amber-600" label="Visits" value={field.month.visits} />
        <Kpi icon={PresentationIcon} tint="bg-sky-50 text-sky-600" label="Demos" value={field.month.demos} />
        <Kpi icon={TrophyIcon} tint="bg-brand-50 text-brand-600" label="Closings" value={field.month.closings} />
      </div>
    </>
  );
}

function TodaysPlan({ field, wide }: { field: FieldSummary; wide: boolean }) {
  return (
        <section className={`card p-6 ${wide ? "lg:col-span-5" : "lg:col-span-2"}`}>
          <SectionHeader title="Today's plan" href="/dashboard/follow-ups" linkLabel="All follow-ups" />
          {field.today.length === 0 ? (
            <EmptyHint text="Nothing scheduled today. Plan a call or visit from any lead." />
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {field.today.slice(0, 6).map((a) => {
                const when = a.status === "completed" ? a.completedAt : a.status === "in_progress" ? a.startedAt : a.scheduledAt;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <ActivityIcon type={a.type} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {ACTIVITY_TYPE_LABELS[a.type]} · {a.lead.company || a.lead.name}
                      </p>
                      <p className={`text-xs ${isOverdue(a) ? "text-red-600" : "text-slate-500"}`}>{formatWhen(when)}</p>
                    </div>
                    {a.status === "completed" ? (
                      <span className="badge badge-success">Done</span>
                    ) : a.status === "in_progress" ? (
                      <span className="badge badge-warning">On site</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
  );
}

function Kpi({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: typeof PhoneIcon;
  tint: string;
  label: string;
  value: number;
}) {
  return (
    <div className="card card-hover p-5">
      <span className={`icon-chip ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-500">{label} this month</p>
    </div>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
        {linkLabel}
        <ArrowRightIcon className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function PipelineBars({ summary }: { summary: LeadSummary }) {
  const max = Math.max(1, ...LEAD_STATUSES.map((s) => summary.byStatus[s] ?? 0));
  if (summary.total === 0) {
    return <EmptyHint text="No leads yet. Add one, or connect a Meta lead form to fill this automatically." />;
  }
  return (
    <div className="mt-5 space-y-3">
      {LEAD_STATUSES.map((status) => {
        const count = summary.byStatus[status] ?? 0;
        return (
          <div key={status} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm font-medium text-slate-600">{LEAD_STATUS_LABELS[status]}</span>
            <div className="h-7 flex-1 rounded-lg bg-slate-100">
              {count > 0 && (
                <div
                  className={`h-7 rounded-lg ${STAGE_BAR[status]}`}
                  style={{ width: `${Math.max(4, (count / max) * 100)}%` }}
                />
              )}
            </div>
            <span className="w-6 text-right text-sm font-bold text-slate-700">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof PhoneIcon }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : <TrendUpIcon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

/** Sent and read per day, as paired bars. Dependency-free on purpose. */
function MessagesChart({ analytics }: { analytics: AnalyticsOverview }) {
  const series = analytics.dailySeries.slice(-30);
  const max = Math.max(1, ...series.map((d) => d.sent));
  const total = series.reduce((sum, d) => sum + d.sent, 0);
  if (total === 0) {
    return <EmptyHint text="No messages sent in the last 30 days. Launch a broadcast to see delivery and reads here." />;
  }
  return (
    <div>
      <div className="flex h-48 items-end gap-1">
        {series.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${d.date}: ${d.sent} sent, ${d.read} read`}>
            <div className="w-full rounded-t-md bg-brand-100" style={{ height: `${(d.sent / max) * 100}%` }}>
              <div className="h-full w-full rounded-t-md bg-brand-500" style={{ transform: `scaleY(${d.sent ? d.read / d.sent : 0})`, transformOrigin: "bottom" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs font-medium text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-100" /> Sent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Read
        </span>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
      <FunnelIcon className="h-5 w-5 shrink-0 text-slate-300" />
      {text}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-72" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-56 lg:col-span-2" />
        <div className="skeleton h-56" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-36" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}
