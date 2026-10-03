"use client";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useApp } from "@/components/ctx";
import { useApi } from "@/components/useApi";
import { localStore } from "@/components/local";
import { Badge, Card, Loading, Offline } from "@/components/ui";
import { scoped } from "@/lib/metrics";
import { CAN } from "@/lib/roles";
import { dt } from "@/lib/format";
import type { Call } from "@/lib/types";

export default function Audit() {
  const { qs, filters, user } = useApp();
  const { data, setData, offline, loading } = useApi<{ calls: Call[] }>(`/api/calls?${qs}`, () => ({ calls: scoped(localStore(), filters, {}).calls.slice(0, 1000) }));
  const [campaign, setCampaign] = useState("all");
  const [disp, setDisp] = useState("all");
  const [minDur, setMinDur] = useState("");
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [page, setPage] = useState(0);
  const canHide = CAN.hideCall.includes(user.role);

  const campaigns = useMemo(() => [...new Set((data?.calls ?? []).map((c) => c.campaign))], [data]);
  const rows = useMemo(() => (data?.calls ?? []).filter((c) =>
    (campaign === "all" || c.campaign === campaign) && (disp === "all" || c.classification === disp) &&
    (!minDur || c.durationSec >= Number(minDur)) && (!hiddenOnly || !c.visible)), [data, campaign, disp, minDur, hiddenOnly]);
  if (loading || !data) return <Loading />;
  const PAGE = 25, pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);

  async function toggle(c: Call) {
    const visible = !c.visible;
    try { await fetch("/api/calls", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, visible }) }); } catch { /* local fallback */ }
    setData((cur) => cur && { calls: cur.calls.map((x) => (x.id === c.id ? { ...x, visible } : x)) });
  }
  const reset = () => setPage(0);

  return (
    <>
      <Offline show={offline} />
      <div className="flex flex-wrap items-center gap-2">
        <select className="input" value={campaign} onChange={(e) => { setCampaign(e.target.value); reset(); }}>
          <option value="all">All campaigns</option>{campaigns.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input" value={disp} onChange={(e) => { setDisp(e.target.value); reset(); }}>
          <option value="all">All dispositions</option>
          {["Paid", "PTP", "Partial", "Callback", "Dispute", "No Contact", "Escalated"].map((x) => <option key={x}>{x}</option>)}
        </select>
        <input className="input w-36" type="number" min={0} placeholder="Min duration (s)" value={minDur} onChange={(e) => { setMinDur(e.target.value); reset(); }} />
        {user.role !== "client" && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={hiddenOnly} onChange={(e) => { setHiddenOnly(e.target.checked); reset(); }} /> Hidden only</label>}
        <span className="ml-auto text-sm text-slate-500">{rows.length} calls</span>
      </div>
      <Card title="Call audit log">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead><tr><th>Date / time</th><th>Phone</th><th>Loan ID</th><th>Call ID</th><th>Campaign</th><th>Duration</th><th>Classification</th><th>Drop-off</th><th>Client visibility</th></tr></thead>
            <tbody className="divide-y">
              {view.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td>{dt(c.ts)}</td><td>{c.phone}</td><td>{c.loanId}</td><td><code className="text-xs">{c.callId}</code></td><td className="text-xs">{c.campaign}</td>
                  <td>{Math.floor(c.durationSec / 60)}:{String(c.durationSec % 60).padStart(2, "0")}</td>
                  <td><Badge>{c.classification}</Badge></td><td className="text-xs">{c.dropReason ?? "—"}</td>
                  <td>
                    <button disabled={!canHide} onClick={() => toggle(c)} className="inline-flex items-center gap-1.5 disabled:cursor-default" title={canHide ? "Toggle client visibility" : undefined}>
                      <Badge>{c.visible ? "Visible" : "Hidden"}</Badge>{canHide && (c.visible ? <EyeOff size={13} className="text-slate-400" /> : <Eye size={13} className="text-slate-400" />)}
                    </button>
                  </td>
                </tr>
              ))}
              {!view.length && <tr><td colSpan={9} className="py-8 text-center text-slate-500">No calls match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <span>Page {page + 1} / {pages}</span>
          <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </Card>
    </>
  );
}
