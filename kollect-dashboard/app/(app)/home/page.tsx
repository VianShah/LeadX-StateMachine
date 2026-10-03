"use client";
import { Sparkles } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from "recharts";
import { useApp } from "@/components/ctx";
import { useApi } from "@/components/useApi";
import { localStore } from "@/components/local";
import { Card, Kpi, Loading, Offline } from "@/components/ui";
import { computeOverview } from "@/lib/metrics";
import { inr, num, pct } from "@/lib/format";

export default function Home() {
  const { qs, filters, user } = useApp();
  const scope = user.role === "client" ? { portfolio: user.portfolio, visibleOnly: true } : {};
  const { data, offline, loading } = useApi(`/api/overview?${qs}`, () => computeOverview(localStore(), filters, scope));
  if (loading || !data) return <Loading />;
  const { kpis: k, trend, insights } = data;
  const short = (s: string) => s.slice(5);

  return (
    <>
      <Offline show={offline} />
      <div className="flex gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <Sparkles className="mt-0.5 shrink-0 text-indigo-600" size={18} />
        <div>
          <div className="font-semibold text-indigo-900">At-a-glance analysis</div>
          <ul className="mt-1 list-disc pl-5 text-sm text-indigo-900/90">{insights.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Portfolio Outstanding" value={inr(k.outstanding)} />
        <Kpi label="Recovered (period)" value={inr(k.recovered)} />
        <Kpi label="Recovery Rate" value={pct(k.recoveryRate)} />
        <Kpi label="Active PTPs" value={num(k.activePtp)} />
        <Kpi label="PTP Kept Rate" value={pct(k.ptpKeptRate)} tone={k.ptpKeptRate >= 70 ? "good" : "bad"} />
        <Kpi label="Contact Rate" value={pct(k.contactRate)} />
        <Kpi label="Contact → PTP" value={pct(k.contactToPtp)} />
        <Kpi label="Payment Links Shared" value={num(k.linksShared)} sub={`${pct(k.linkConversion)} conversion`} />
        <Kpi label="Avg DPD" value={`${k.avgDpd.toFixed(0)} days`} />
        <Kpi label="Open Escalations" value={num(k.openEscalations)} tone={k.openEscalations > 40 ? "bad" : undefined} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Daily Contact Trend">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={short} fontSize={11} />
              <YAxis yAxisId="l" fontSize={11} />
              <YAxis yAxisId="r" orientation="right" unit="%" domain={[0, 100]} fontSize={11} />
              <Tooltip formatter={(v, n) => (n === "Connect rate" ? `${Number(v).toFixed(1)}%` : v)} />
              <Legend />
              <Bar yAxisId="l" dataKey="attempted" name="Attempted" fill="#c7d2fe" />
              <Bar yAxisId="l" dataKey="connected" name="Connected" fill="#4f46e5" />
              <Line yAxisId="r" dataKey="connectRate" name="Connect rate" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Disposition Trend">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={short} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="paid" name="Paid" stackId="a" fill="#10b981" />
              <Bar dataKey="ptp" name="PTP" stackId="a" fill="#4f46e5" />
              <Bar dataKey="dispute" name="Dispute" stackId="a" fill="#f59e0b" />
              <Bar dataKey="other" name="Other" stackId="a" fill="#94a3b8" />
              <Bar dataKey="noContact" name="No Contact" stackId="a" fill="#e2e8f0" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}
