"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInr } from "@starpos-crm/shared";
import { ApiError, type TargetRow, type TargetsBoard, getAccessToken, getTargets, setTarget } from "../../../lib/api";
import { paiseToInput, rupeesToPaise } from "../../../lib/money";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useToast } from "../../../components/Toaster";
import { TargetIcon, TrophyIcon } from "../../../components/icons";
import { useAccess } from "../../../components/AccessContext";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

function percent(row: TargetRow) {
  return row.amountPaise ? Math.round((row.achievedPaise / row.amountPaise) * 100) : null;
}

const MEDALS = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-800", "bg-orange-300 text-orange-950"];

/**
 * Monthly sales targets (mockup screen 15): the team's goal and each rep's,
 * against won deal value in the workspace's own month. Admins set the numbers
 * inline; everyone sees the leaderboard.
 */
export default function TargetsPage() {
  const access = useAccess();
  const router = useRouter();
  const toast = useToast();
  const [month, setMonth] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [board, setBoard] = useState<TargetsBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = access.canEdit("targets");

  const load = useCallback(async (m?: string) => {
    const b = await getTargets(m);
    setBoard(b);
    setMonth(b.month);
    if (!m) setCurrentMonth(b.month);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    load().catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push("/login");
        else setError(err instanceof ApiError ? err.message : "Could not load targets");
      });
  }, [router, load]);

  async function go(delta: number) {
    if (!month) return;
    try {
      await load(shiftMonth(month, delta));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not load that month", "error");
    }
  }

  async function save(userId: string | null, input: string) {
    if (!month) return;
    const amountPaise = input.trim() ? rupeesToPaise(input) : 0;
    if (amountPaise === null) {
      toast("Enter the target in rupees", "error");
      return;
    }
    try {
      await setTarget({ month, userId, amountPaise });
      await load(month);
      toast(amountPaise ? "Target saved" : "Target removed");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the target", "error");
    }
  }

  if (!board && !error) return <PageSkeleton />;

  const team = board?.team;
  const teamPct = team ? percent(team) : null;
  const repsTargetSum = board?.reps.reduce((s, r) => s + (r.amountPaise ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Targets</h1>
          <p className="page-subtitle">Monthly goals against won deal value, for the team and each rep.</p>
        </div>
        {month && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-card">
            <button type="button" className="btn-ghost px-2.5 py-1" onClick={() => void go(-1)} aria-label="Previous month">
              ‹
            </button>
            <span className="min-w-[130px] text-center text-sm font-bold text-slate-800">{monthLabel(month)}</span>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 disabled:opacity-30"
              disabled={!!currentMonth && month >= shiftMonth(currentMonth, 1)}
              onClick={() => void go(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {team && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900 p-6 text-white shadow-card">
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing value={teamPct ?? 0} empty={teamPct === null} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-100">Team this month</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">
                {formatInr(team.achievedPaise)}
                {team.amountPaise ? (
                  <span className="text-lg font-semibold text-brand-100"> of {formatInr(team.amountPaise)}</span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-brand-100">
                {team.closings} {team.closings === 1 ? "deal" : "deals"} won · {formatInr(team.collectedPaise)} collected
                {team.amountPaise && team.achievedPaise < team.amountPaise
                  ? ` · ${formatInr(team.amountPaise - team.achievedPaise)} to go`
                  : ""}
              </p>
            </div>
            {isAdmin && (
              <TargetInput
                key={`team-${board?.month}`}
                label="Team target"
                dark
                initial={team.amountPaise}
                hint={repsTargetSum ? `Reps add up to ${formatInr(repsTargetSum)}` : undefined}
                onSave={(v) => save(null, v)}
              />
            )}
          </div>
          <TargetIcon className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 text-white/5" />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <TrophyIcon className="h-5 w-5 text-amber-500" />
          <p className="font-bold text-slate-900">Leaderboard</p>
        </div>
        {board && board.reps.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No team members yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {board?.reps.map((rep, i) => {
              const pct = percent(rep);
              const name = rep.user.name ?? rep.user.email;
              return (
                <li key={rep.user.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                      rep.achievedPaise > 0 && i < 3 ? MEDALS[i] : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-bold text-slate-900">{name}</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatInr(rep.achievedPaise)}
                        {rep.amountPaise ? <span className="font-medium text-slate-400"> / {formatInr(rep.amountPaise)}</span> : null}
                      </p>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${pct !== null && pct >= 100 ? "bg-gradient-to-r from-leaf-500 to-leaf-400" : "bg-brand-500"}`}
                        style={{ width: `${pct === null ? 0 : Math.min(100, pct)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {pct === null ? "No target set" : pct >= 100 ? `Target hit · ${pct}%` : `${pct}% of target`} · {rep.closings}{" "}
                      {rep.closings === 1 ? "deal" : "deals"} · {formatInr(rep.collectedPaise)} collected
                    </p>
                  </div>
                  {isAdmin && (
                    <TargetInput key={`${rep.user.id}-${board.month}`} label={`Target for ${name}`} initial={rep.amountPaise} onSave={(v) => save(rep.user.id, v)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TargetInput({
  label,
  initial,
  onSave,
  dark,
  hint,
}: {
  label: string;
  initial: number | null;
  onSave: (value: string) => Promise<void>;
  dark?: boolean;
  hint?: string;
}) {
  const start = initial ? paiseToInput(initial) : "";
  const [value, setValue] = useState(start);
  const [busy, setBusy] = useState(false);
  const dirty = value.trim() !== start;

  return (
    <div className="w-full sm:w-auto">
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm ${dark ? "text-white/60" : "text-slate-400"}`}>₹</span>
          <input
            aria-label={label}
            className={
              dark
                ? "w-40 rounded-xl border border-white/20 bg-white/10 py-2 pl-7 pr-3 text-sm font-semibold text-white placeholder:text-white/50 focus:border-white/50 focus:outline-none"
                : "input w-40 py-2 pl-7"
            }
            inputMode="decimal"
            placeholder="Set target"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) {
                setBusy(true);
                void onSave(value).finally(() => setBusy(false));
              }
            }}
          />
        </div>
        {dirty && (
          <button
            type="button"
            disabled={busy}
            className={dark ? "rounded-xl bg-white px-3 py-2 text-sm font-bold text-brand-700" : "btn-primary py-2"}
            onClick={() => {
              setBusy(true);
              void onSave(value).finally(() => setBusy(false));
            }}
          >
            Save
          </button>
        )}
      </div>
      {hint && <p className={`mt-1 text-xs ${dark ? "text-white/60" : "text-slate-500"}`}>{hint}</p>}
    </div>
  );
}

function ProgressRing({ value, empty }: { value: number; empty: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, value));
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
        {!empty && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="white"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (shown / 100) * c}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold">{empty ? "—" : `${value}%`}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-100">{empty ? "no target" : "achieved"}</span>
      </div>
    </div>
  );
}
