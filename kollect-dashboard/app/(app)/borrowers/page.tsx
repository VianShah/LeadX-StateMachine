"use client";
import { useMemo, useState } from "react";
import { Check, Copy, Download, Link2, Siren } from "lucide-react";
import { useApp } from "@/components/ctx";
import { useApi } from "@/components/useApi";
import { localStore } from "@/components/local";
import { Badge, Card, Loading, Offline } from "@/components/ui";
import { scoped } from "@/lib/metrics";
import { CAN } from "@/lib/roles";
import { d, inrFull } from "@/lib/format";
import type { Borrower } from "@/lib/types";

const SEGMENTS = ["All", "Pre Due", "Post Due (0–30)", "Post Due (30–90)"];
const tier = (s: number) => (s >= 750 ? "Prime" : s >= 650 ? "Near-prime" : "Subprime");

export default function Borrowers() {
  const { qs, filters, user } = useApp();
  const scope = user.role === "client" ? { portfolio: user.portfolio, visibleOnly: true } : {};
  const { data, setData, offline, loading } = useApi<{ borrowers: Borrower[] }>(`/api/borrowers?${qs}`, () => ({ borrowers: scoped(localStore(), filters, scope).borrowers }));
  const [seg, setSeg] = useState("All");
  const [q, setQ] = useState("");
  const [disp, setDisp] = useState("all");
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState("");
  const rows = useMemo(() => (data?.borrowers ?? []).filter((b) =>
    (seg === "All" || b.segment === seg) && (disp === "all" || b.disposition === disp) &&
    (!q || `${b.name} ${b.loanId} ${b.id}`.toLowerCase().includes(q.toLowerCase()))), [data, seg, disp, q]);
  if (loading || !data) return <Loading />;
  const PAGE = 25, pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const canLink = CAN.sendLink.includes(user.role), canEsc = CAN.escalate.includes(user.role);

  async function act(b: Borrower, action: "sendLink" | "escalate") {
    const patch: Partial<Borrower> = action === "sendLink" ? { paymentLink: "Shared" } : { disposition: "Escalated", channel: "Human Desk" };
    let ok = false;
    try { ok = (await fetch("/api/borrowers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, action }) })).ok; } catch { /* offline */ }
    // optimistic / local fallback: keep UI in sync even if the server call failed
    setData((cur) => cur && { borrowers: cur.borrowers.map((x) => (x.id === b.id ? { ...x, ...patch } : x)) });
    if (!ok) console.warn("Action stored locally only");
  }

  function exportCsv() {
    const head = ["Name", "Phone", "LoanID", "Segment", "EMI", "Outstanding", "DPD", "Disposition", "PaymentLink", "Experian", "Channel", "PTPDate", "PTPAmount"];
    const lines = rows.map((b) => [b.name, b.phone, b.loanId, b.segment, b.emi, b.outstanding, b.dpd, b.disposition, b.paymentLink, b.experian, b.channel, b.ptpDate?.slice(0, 10) ?? "", b.ptpAmount ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "borrowers.csv" }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Offline show={offline} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          {SEGMENTS.map((s) => <button key={s} onClick={() => { setSeg(s); setPage(0); }} className={`px-3 py-1.5 text-sm ${seg === s ? "bg-indigo-600 text-white" : "bg-white hover:bg-slate-50"}`}>{s}</button>)}
        </div>
        <input className="input w-64" placeholder="Search name, loan ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="input" value={disp} onChange={(e) => { setDisp(e.target.value); setPage(0); }}>
          <option value="all">All dispositions</option>
          {["Paid", "PTP", "Partial", "Callback", "Dispute", "No Contact", "Escalated"].map((x) => <option key={x}>{x}</option>)}
        </select>
        <button className="btn ml-auto" onClick={exportCsv}><Download size={14} /> Export CSV ({rows.length})</button>
      </div>
      <Card title={`Borrower queue`}>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead><tr><th>Borrower</th><th>Loan ID</th><th>Segment</th><th>EMI</th><th>Outstanding</th><th>DPD</th><th>Disposition</th><th>Payment link</th><th>Experian</th><th>Channel</th><th>PTP</th><th /></tr></thead>
            <tbody className="divide-y">
              {view.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td><div className="font-medium">{b.name}</div><div className="text-xs text-slate-500">{b.phone}</div></td>
                  <td><button className="inline-flex items-center gap-1 hover:text-indigo-600" onClick={() => { navigator.clipboard?.writeText(b.loanId); setCopied(b.id); setTimeout(() => setCopied(""), 1200); }}>{b.loanId}{copied === b.id ? <Check size={12} /> : <Copy size={12} />}</button></td>
                  <td className="text-xs">{b.segment}</td>
                  <td>{inrFull(b.emi)}</td><td>{inrFull(b.outstanding)}</td><td>{b.dpd}</td>
                  <td><Badge>{b.disposition}</Badge></td><td><Badge>{b.paymentLink}</Badge></td>
                  <td>{b.experian} <Badge>{tier(b.experian)}</Badge></td>
                  <td>{b.channel}</td>
                  <td>{b.ptpDate ? `${d(b.ptpDate)} · ${inrFull(b.ptpAmount ?? 0)}` : "—"}</td>
                  <td className="space-x-1">
                    {canLink && b.paymentLink === "Not shared" && b.disposition !== "Paid" && <button className="btn" title="Send payment link" onClick={() => act(b, "sendLink")}><Link2 size={14} /></button>}
                    {canEsc && b.disposition !== "Escalated" && b.disposition !== "Paid" && <button className="btn" title="Escalate to human desk" onClick={() => act(b, "escalate")}><Siren size={14} /></button>}
                  </td>
                </tr>
              ))}
              {!view.length && <tr><td colSpan={12} className="py-8 text-center text-slate-500">No borrowers match.</td></tr>}
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
