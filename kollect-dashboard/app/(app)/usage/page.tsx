"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/components/ctx";
import { useApi } from "@/components/useApi";
import { localStore } from "@/components/local";
import { Card, Kpi, Loading, Offline } from "@/components/ui";
import { computeUsage } from "@/lib/metrics";
import { num } from "@/lib/format";

export default function Usage() {
  const { qs, filters, user } = useApp();
  const scope = user.role === "client" ? { portfolio: user.portfolio, visibleOnly: true } : {};
  const { data, offline, loading } = useApi(`/api/usage?${qs}`, () => computeUsage(localStore(), filters, scope));
  if (loading || !data) return <Loading />;
  const { kpis: k } = data;
  return (
    <>
      <Offline show={offline} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Usage minutes" value={num(k.minutes)} />
        <Kpi label="Connected calls" value={num(k.connectedCalls)} />
        <Kpi label="Avg min / call" value={k.avgMinPerCall.toFixed(1)} />
        <Kpi label="Verticals billed" value={k.verticals} />
      </div>
      <Card title="Daily usage (billable connected minutes)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.dailyMinutes}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(s: string) => s.slice(5)} fontSize={11} /><YAxis fontSize={11} />
            <Tooltip formatter={(v) => [`${v} min`, "Minutes"]} /><Bar dataKey="minutes" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Usage by campaign">
        <table className="w-full"><thead><tr><th>Campaign</th><th>Connected calls</th><th>Raw seconds</th><th>Billable minutes</th></tr></thead>
          <tbody className="divide-y">{data.campaigns.map((c) => (
            <tr key={c.campaign}><td><code className="text-xs">{c.campaign}</code></td><td>{num(c.calls)}</td><td>{num(c.seconds)}</td><td className="font-medium">{num(c.billableMinutes)}</td></tr>
          ))}</tbody></table>
      </Card>
    </>
  );
}
