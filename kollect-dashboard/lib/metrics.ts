import type { Borrower, Call, Filters, Scope, Store } from "./types";

export function rangeBounds(f: Filters, now = Date.now()): [number, number] {
  const day = 86400000;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const s = startOfToday.getTime();
  switch (f.range) {
    case "today": return [s, now];
    case "7d": return [s - 6 * day, now];
    case "mtd": { const m = new Date(now); m.setDate(1); m.setHours(0, 0, 0, 0); return [m.getTime(), now]; }
    case "custom": return [f.from ? new Date(f.from).getTime() : s - 29 * day, f.to ? new Date(f.to).getTime() + day - 1 : now];
    default: return [s - 29 * day, now];
  }
}

export function scoped(store: Store, f: Filters, scope: Scope, now = Date.now()) {
  const [from, to] = rangeBounds(f, now);
  const portfolio = scope.portfolio ?? f.portfolio;
  const okP = (p: string) => !portfolio || portfolio === "all" || p === portfolio;
  const okC = (c: string) => !f.channel || f.channel === "all" || c === f.channel;
  const borrowers = store.borrowers.filter((b) => okP(b.portfolio) && okC(b.channel));
  const calls = store.calls.filter((c) => {
    const t = new Date(c.ts).getTime();
    return t >= from && t <= to && okP(c.portfolio) && okC(c.channel) && (!scope.visibleOnly || c.visible);
  });
  return { borrowers, calls, from, to };
}

const ratio = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const dayKey = (iso: string) => iso.slice(0, 10);

function daily(calls: Call[], from: number, to: number) {
  const days: string[] = [];
  for (let t = from; t <= to; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  return [...new Set(days)];
}

export function computeOverview(store: Store, f: Filters, scope: Scope) {
  const { borrowers, calls, from, to } = scoped(store, f, scope);
  const connected = calls.filter((c) => c.connected);
  const recovered = sum(borrowers.filter((b) => b.recoveredAt && new Date(b.recoveredAt).getTime() >= from && new Date(b.recoveredAt).getTime() <= to).map((b) => b.recoveredAmount));
  const outstanding = sum(borrowers.map((b) => b.outstanding));
  const activePtp = borrowers.filter((b) => b.disposition === "PTP").length;
  const kept = borrowers.filter((b) => b.ptpOutcome === "kept").length;
  const broken = borrowers.filter((b) => b.ptpOutcome === "broken").length;
  const links = borrowers.filter((b) => b.paymentLink !== "Not shared");
  const kpis = {
    outstanding,
    recovered,
    recoveryRate: ratio(recovered, outstanding),
    activePtp,
    ptpKeptRate: ratio(kept, kept + broken),
    contactRate: ratio(connected.length, calls.length),
    contactToPtp: ratio(connected.filter((c) => c.classification === "PTP").length, connected.length),
    linksShared: links.length,
    linkConversion: ratio(links.filter((b) => b.paymentLink === "Paid via link").length, links.length),
    avgDpd: borrowers.length ? sum(borrowers.map((b) => b.dpd)) / borrowers.length : 0,
    openEscalations: borrowers.filter((b) => b.disposition === "Escalated").length,
  };

  const byDay = new Map<string, { attempted: number; connected: number; paid: number; ptp: number; noContact: number; dispute: number; other: number }>();
  for (const d of daily(calls, from, to)) byDay.set(d, { attempted: 0, connected: 0, paid: 0, ptp: 0, noContact: 0, dispute: 0, other: 0 });
  for (const c of calls) {
    const row = byDay.get(dayKey(c.ts));
    if (!row) continue;
    row.attempted++;
    if (c.connected) row.connected++;
    if (c.classification === "Paid") row.paid++;
    else if (c.classification === "PTP") row.ptp++;
    else if (c.classification === "No Contact") row.noContact++;
    else if (c.classification === "Dispute") row.dispute++;
    else row.other++;
  }
  const trend = [...byDay.entries()].map(([date, v]) => ({ date, ...v, connectRate: ratio(v.connected, v.attempted) }));

  const insights: string[] = [];
  insights.push(`Recovered ${kpis.recoveryRate.toFixed(1)}% of the outstanding book this period with a ${kpis.contactRate.toFixed(1)}% contact rate.`);
  if (trend.length >= 2) {
    const last = trend[trend.length - 1], prev = trend[trend.length - 2];
    const diff = last.connectRate - prev.connectRate;
    insights.push(`Latest connect rate is ${last.connectRate.toFixed(0)}% (${diff >= 0 ? "up" : "down"} ${Math.abs(diff).toFixed(1)} pts vs the previous day).`);
  }
  if (kpis.ptpKeptRate < 70) insights.push(`PTP kept rate is ${kpis.ptpKeptRate.toFixed(1)}%, below the 70% target; consider earlier reminder nudges.`);
  else insights.push(`PTP kept rate is healthy at ${kpis.ptpKeptRate.toFixed(1)}%.`);
  if (kpis.openEscalations > 30) insights.push(`${kpis.openEscalations} open escalations need human follow-up.`);
  if (kpis.linkConversion < 40) insights.push(`Payment link conversion is ${kpis.linkConversion.toFixed(1)}%; link clicks are not converting to payments.`);

  return { kpis, trend, insights };
}

export function computePerformance(store: Store, f: Filters, scope: Scope) {
  const { borrowers, calls } = scoped(store, f, scope);
  const funnel = [
    { stage: "Assigned", value: borrowers.length },
    { stage: "Contacted", value: borrowers.filter((b) => b.stage >= 1).length },
    { stage: "Engaged", value: borrowers.filter((b) => b.stage >= 2).length },
    { stage: "PTP", value: borrowers.filter((b) => b.stage >= 3).length },
    { stage: "Recovered", value: borrowers.filter((b) => b.stage >= 4).length },
  ];
  const count = <T,>(items: T[], key: (t: T) => string) => {
    const m = new Map<string, number>();
    items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const dispositions = count(borrowers, (b) => b.disposition);
  const nonContact = count(calls.filter((c) => !c.connected), (c) => c.dropReason ?? "unknown");
  const attempts = [1, 2, 3, 4, 5].map((n) => {
    const at = calls.filter((c) => c.attemptNo === n);
    return { attempt: `${n}${["st", "nd", "rd"][n - 1] ?? "th"} attempt`, calls: at.length, connected: at.filter((c) => c.connected).length };
  });
  const group = (key: (b: Borrower) => string) => {
    const m = new Map<string, Borrower[]>();
    borrowers.forEach((b) => m.set(key(b), [...(m.get(key(b)) ?? []), b]));
    return [...m.entries()].map(([name, bs]) => ({
      name,
      assigned: bs.length,
      contacted: bs.filter((b) => b.stage >= 1).length,
      ptp: bs.filter((b) => b.stage >= 3).length,
      recovered: bs.filter((b) => b.stage >= 4).length,
      outstanding: sum(bs.map((b) => b.outstanding)),
      recoveredAmount: sum(bs.map((b) => b.recoveredAmount)),
    }));
  };
  return {
    funnel, dispositions, nonContact, attempts,
    stages: group((b) => b.segment),
    channels: group((b) => b.channel),
    regions: group((b) => b.region),
    escalations: borrowers.filter((b) => b.disposition === "Escalated").sort((a, b) => b.outstanding - a.outstanding).slice(0, 50),
  };
}

export function computeUsage(store: Store, f: Filters, scope: Scope) {
  const { calls, from, to } = scoped(store, f, { ...scope });
  const connected = calls.filter((c) => c.connected);
  const secs = sum(connected.map((c) => c.durationSec));
  const dayMap = new Map<string, number>();
  for (const d of daily(calls, from, to)) dayMap.set(d, 0);
  connected.forEach((c) => dayMap.set(dayKey(c.ts), (dayMap.get(dayKey(c.ts)) ?? 0) + c.durationSec));
  const dailyMinutes = [...dayMap.entries()].map(([date, s]) => ({ date, minutes: Math.round(s / 60) }));
  const byCampaign = new Map<string, { calls: number; seconds: number }>();
  connected.forEach((c) => {
    const row = byCampaign.get(c.campaign) ?? { calls: 0, seconds: 0 };
    row.calls++; row.seconds += c.durationSec;
    byCampaign.set(c.campaign, row);
  });
  return {
    kpis: {
      minutes: Math.ceil(secs / 60),
      connectedCalls: connected.length,
      avgMinPerCall: connected.length ? secs / 60 / connected.length : 0,
      verticals: new Set(connected.map((c) => c.portfolio)).size,
    },
    dailyMinutes,
    campaigns: [...byCampaign.entries()].map(([campaign, v]) => ({ campaign, ...v, billableMinutes: Math.ceil(v.seconds / 60) })).sort((a, b) => b.seconds - a.seconds),
  };
}
