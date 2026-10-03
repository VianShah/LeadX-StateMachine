"use client";
import { useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { Card } from "@/components/ui";

interface Report { sheet: string; rows: number; imported: number; errors: string[] }

export default function DataPage() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState<Report[]>([]);

  async function upload() {
    const f = ref.current?.files?.[0];
    if (!f) return setMsg("Choose an .xlsx file first.");
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!res) return setMsg("Server unreachable.");
    const body = await res.json();
    if (!res.ok) return setMsg(body.error ?? "Upload failed");
    setReport(body.report);
    setMsg(body.applied ? "Data imported. All modules now use this file." : "Nothing imported, see the report below.");
  }
  async function reset() {
    await fetch("/api/reset", { method: "POST" });
    setReport([]); setMsg("Reset to generated mock data.");
  }

  return (
    <>
      <Card title="Import from Excel">
        <p className="mb-3 text-sm text-slate-600">Upload a workbook with sheets named <b>Borrowers</b>, <b>Calls</b> and/or <b>Agents</b>. Column headers are matched flexibly (e.g. <code>LoanID</code>, <code>Loan No</code>). Each sheet you include replaces the matching dataset.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={ref} type="file" accept=".xlsx,.xls" className="text-sm" />
          <button className="btn btn-primary" onClick={upload} disabled={busy}><Upload size={14} /> {busy ? "Importing…" : "Import"}</button>
          <a className="btn" href="/api/template"><Download size={14} /> Download template</a>
          <button className="btn" onClick={reset}><RotateCcw size={14} /> Reset to mock data</button>
        </div>
        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}
        {report.length > 0 && (
          <table className="mt-3 w-full"><thead><tr><th>Sheet</th><th>Rows</th><th>Imported</th><th>Issues</th></tr></thead>
            <tbody className="divide-y">{report.map((r) => (
              <tr key={r.sheet}><td>{r.sheet}</td><td>{r.rows}</td><td>{r.imported}</td><td className="text-xs text-red-600">{r.errors.join("; ") || "—"}</td></tr>
            ))}</tbody></table>
        )}
      </Card>
      <Card title="Live data via API">
        <p className="mb-2 text-sm text-slate-600">Dialer and WhatsApp platforms can push call events and live capacity to the server:</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`POST /api/ingest/events
x-api-key: <INGEST_KEY>
{
  "calls":  [{ "callId": "...", "ts": "2026-10-03T10:15:00Z", "campaign": "KOLLECT_PD30_VOICE_HI",
               "portfolio": "Alpha NBFC", "channel": "AI Voice", "phone": "+91 98•••", "loanId": "LN...",
               "durationSec": 120, "classification": "PTP", "attemptNo": 1 }],
  "agents": [{ "code": "KOLLECT_PD30_VOICE_HI", "live": 7, "max": 12 }]
}`}</pre>
      </Card>
    </>
  );
}
