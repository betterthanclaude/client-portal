import type { UsageRun } from './qc-api';

// The QC ledger groups by job submission in UTC, not the viewer's time zone.
export function dailyHours(runs: UsageRun[], since: number, until: number) {
  const days = new Map<string, number>();
  const first = new Date(since * 1000); first.setUTCHours(0, 0, 0, 0);
  for (let day = first.getTime(); day < until * 1000; day += 86400000) days.set(new Date(day).toISOString().slice(0, 10), 0);
  const seen = new Set<string>();
  for (const run of runs) {
    if (seen.has(run.id) || run.created < since || run.created >= until || run.measured_hours === null) continue;
    seen.add(run.id);
    const date = new Date(run.created * 1000).toISOString().slice(0, 10);
    days.set(date, (days.get(date) || 0) + run.measured_hours);
  }
  return [...days].map(([date, hours]) => ({ date, hours }));
}
