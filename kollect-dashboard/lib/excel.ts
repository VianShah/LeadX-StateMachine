import * as XLSX from "xlsx";
import type { Agent, Borrower, Call, Channel, Disposition, LinkStatus, Segment } from "./types";

type Row = Record<string, unknown>;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// canonical field -> accepted header aliases (normalised)
const ALIASES: Record<string, string[]> = {
  id: ["id", "borrowerid", "customerid"],
  name: ["name", "borrowername", "customername"],
  phone: ["phone", "mobile", "phonenumber", "mobilenumber"],
  loanId: ["loanid", "loanno", "loannumber", "accountno"],
  segment: ["segment", "bucket"],
  portfolio: ["portfolio", "client", "business"],
  region: ["region", "zone"],
  emi: ["emi", "emiamount"],
  outstanding: ["outstanding", "pos", "principaloutstanding", "outstandingamount"],
  dpd: ["dpd", "dayspastdue"],
  disposition: ["disposition", "status", "classification", "outcome"],
  paymentLink: ["paymentlink", "paymentlinkstatus", "linkstatus"],
  experian: ["experian", "experianscore", "creditscore", "bureauscore"],
  channel: ["channel"],
  ptpDate: ["ptpdate", "promisedate"],
  ptpAmount: ["ptpamount", "promiseamount"],
  recoveredAmount: ["recoveredamount", "recovered", "collected", "collectedamount"],
  recoveredAt: ["recoveredat", "recoverydate", "collecteddate"],
  ts: ["ts", "timestamp", "datetime", "calltime", "date"],
  callId: ["callid", "callref"],
  campaign: ["campaign", "campaigncode"],
  duration: ["duration", "durationsec", "durationseconds", "calldurationsec"],
  dropReason: ["dropreason", "dropoffreason", "reason", "disconnectreason"],
  attemptNo: ["attemptno", "attempt", "attemptnumber"],
  visible: ["visible", "clientvisible", "visibility"],
  name_: ["agentname", "agent"],
  code: ["code", "campaigncode"],
  product: ["product"],
  language: ["language"],
  voice: ["voice", "voicepersona", "persona"],
  live: ["live", "livecalls"],
  max: ["max", "maxcapacity", "capacity"],
};

function pickField(row: Row, field: string): unknown {
  const wanted = ALIASES[field] ?? [norm(field)];
  for (const k of Object.keys(row)) if (wanted.includes(norm(k))) return row[k];
  return undefined;
}
const str = (v: unknown, d = "") => (v == null || v === "" ? d : String(v).trim());
const numv = (v: unknown, d = 0) => { const n = Number(String(v ?? "").replace(/[₹,\s]/g, "")); return Number.isFinite(n) ? n : d; };
const iso = (v: unknown): string | undefined => {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString();
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

const DISPOSITIONS: Disposition[] = ["Paid", "PTP", "Partial", "Callback", "Dispute", "No Contact", "Escalated"];
const toDisposition = (v: unknown): Disposition => {
  const n = norm(str(v));
  return DISPOSITIONS.find((x) => norm(x) === n) ?? (n.includes("nocontact") ? "No Contact" : "Callback");
};
const toChannel = (v: unknown): Channel => {
  const n = norm(str(v));
  return n.includes("whatsapp") || n === "wa" ? "WhatsApp" : n.includes("human") || n.includes("desk") ? "Human Desk" : "AI Voice";
};
const toSegment = (v: unknown, dpd: number): Segment => {
  const n = norm(str(v));
  if (n.includes("pre")) return "Pre Due";
  if (n.includes("3090") || n.includes("30")) return dpd > 30 || n.includes("3090") ? "Post Due (30–90)" : "Post Due (0–30)";
  if (n.includes("post")) return "Post Due (0–30)";
  return dpd <= 0 ? "Pre Due" : dpd <= 30 ? "Post Due (0–30)" : "Post Due (30–90)";
};
const toLink = (v: unknown): LinkStatus => {
  const n = norm(str(v));
  return n.includes("paid") ? "Paid via link" : n.includes("click") ? "Link clicked" : n.includes("shared") || n === "sent" ? "Shared" : "Not shared";
};
const stageOf = (d: Disposition): Borrower["stage"] =>
  d === "Paid" ? 4 : d === "PTP" || d === "Partial" ? 3 : d === "Dispute" || d === "Escalated" ? 2 : d === "Callback" ? 1 : 0;
const mask = (p: string) => (p.includes("•") ? p : p.length >= 10 ? `${p.slice(0, 3)}••• ••${p.slice(-2)}` : p);

export interface ParseResult {
  borrowers?: Borrower[];
  calls?: Call[];
  agents?: Agent[];
  report: { sheet: string; rows: number; imported: number; errors: string[] }[];
}

const REQUIRED: Record<string, string[]> = {
  Borrowers: ["loanId", "outstanding"],
  Calls: ["ts", "campaign"],
  Agents: ["code"],
};

function sheetByName(wb: XLSX.WorkBook, name: string) {
  const key = wb.SheetNames.find((s) => norm(s) === norm(name) || norm(s) === norm(name.replace(/s$/, "")));
  return key ? wb.Sheets[key] : undefined;
}

export function parseWorkbook(buf: Buffer): ParseResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const out: ParseResult = { report: [] };

  const borrowersSheet = sheetByName(wb, "Borrowers");
  if (borrowersSheet) {
    const rows = XLSX.utils.sheet_to_json<Row>(borrowersSheet, { defval: "" });
    const errors: string[] = [];
    const list: Borrower[] = [];
    rows.forEach((row, i) => {
      const missing = REQUIRED.Borrowers.filter((f) => pickField(row, f) === undefined || pickField(row, f) === "");
      if (missing.length) { if (errors.length < 10) errors.push(`Row ${i + 2}: missing ${missing.join(", ")}`); return; }
      const dpd = numv(pickField(row, "dpd"));
      const disposition = toDisposition(pickField(row, "disposition"));
      const recoveredAmount = numv(pickField(row, "recoveredAmount"), disposition === "Paid" ? numv(pickField(row, "emi")) : 0);
      list.push({
        id: str(pickField(row, "id"), `B${i + 1}`),
        name: str(pickField(row, "name"), "Unknown"),
        phone: mask(str(pickField(row, "phone"))),
        loanId: str(pickField(row, "loanId")),
        segment: toSegment(pickField(row, "segment"), dpd),
        portfolio: str(pickField(row, "portfolio"), "Default"),
        region: str(pickField(row, "region"), "—"),
        emi: numv(pickField(row, "emi")),
        outstanding: numv(pickField(row, "outstanding")),
        dpd,
        disposition,
        stage: stageOf(disposition),
        paymentLink: toLink(pickField(row, "paymentLink")),
        experian: numv(pickField(row, "experian"), 700),
        channel: toChannel(pickField(row, "channel")),
        ptpDate: iso(pickField(row, "ptpDate")),
        ptpAmount: numv(pickField(row, "ptpAmount")) || undefined,
        ptpOutcome: disposition === "PTP" ? "pending" : disposition === "Paid" ? "kept" : undefined,
        recoveredAmount,
        recoveredAt: iso(pickField(row, "recoveredAt")) ?? (recoveredAmount ? new Date().toISOString() : undefined),
      });
    });
    out.borrowers = list;
    out.report.push({ sheet: "Borrowers", rows: rows.length, imported: list.length, errors });
  }

  const callsSheet = sheetByName(wb, "Calls");
  if (callsSheet) {
    const rows = XLSX.utils.sheet_to_json<Row>(callsSheet, { defval: "" });
    const errors: string[] = [];
    const list: Call[] = [];
    rows.forEach((row, i) => {
      const ts = iso(pickField(row, "ts"));
      if (!ts || !str(pickField(row, "campaign"))) { if (errors.length < 10) errors.push(`Row ${i + 2}: missing/invalid timestamp or campaign`); return; }
      const classification = toDisposition(pickField(row, "disposition"));
      const durationSec = numv(pickField(row, "duration"));
      const connected = classification !== "No Contact" && durationSec > 0;
      const visibleRaw = norm(str(pickField(row, "visible"), "yes"));
      list.push({
        id: `X${i + 1}`,
        ts,
        phone: mask(str(pickField(row, "phone"))),
        loanId: str(pickField(row, "loanId")),
        callId: str(pickField(row, "callId"), `call_${i + 1}`),
        campaign: str(pickField(row, "campaign")),
        portfolio: str(pickField(row, "portfolio"), "Default"),
        channel: toChannel(pickField(row, "channel")),
        durationSec,
        classification,
        connected,
        dropReason: connected ? undefined : str(pickField(row, "dropReason"), "no_answer"),
        attemptNo: numv(pickField(row, "attemptNo"), 1),
        visible: !["no", "false", "hidden", "0"].includes(visibleRaw),
      });
    });
    list.sort((a, b) => b.ts.localeCompare(a.ts));
    out.calls = list;
    out.report.push({ sheet: "Calls", rows: rows.length, imported: list.length, errors });
  }

  const agentsSheet = sheetByName(wb, "Agents");
  if (agentsSheet) {
    const rows = XLSX.utils.sheet_to_json<Row>(agentsSheet, { defval: "" });
    const errors: string[] = [];
    const list: Agent[] = [];
    rows.forEach((row, i) => {
      if (!str(pickField(row, "code"))) { if (errors.length < 10) errors.push(`Row ${i + 2}: missing code`); return; }
      const max = numv(pickField(row, "max"), 10);
      list.push({
        id: `A${i + 1}`,
        name: str(pickField(row, "name_"), str(pickField(row, "code"))),
        code: str(pickField(row, "code")),
        business: str(pickField(row, "portfolio"), "Kollect"),
        product: str(pickField(row, "product"), "—"),
        language: str(pickField(row, "language"), "—"),
        voice: str(pickField(row, "voice"), "—"),
        channel: toChannel(pickField(row, "channel")),
        live: Math.min(numv(pickField(row, "live")), max),
        max,
        resolved: 0,
        open: 0,
      });
    });
    out.agents = list;
    out.report.push({ sheet: "Agents", rows: rows.length, imported: list.length, errors });
  }

  if (!out.report.length) out.report.push({ sheet: "(none)", rows: 0, imported: 0, errors: ["No sheets named Borrowers, Calls or Agents were found."] });
  return out;
}

export function buildTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Row[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  add("Borrowers", [
    { BorrowerID: "B1001", Name: "Aarav Sharma", Phone: "9876543210", LoanID: "LN2024000123", Segment: "Post Due (0–30)", Portfolio: "Alpha NBFC", Region: "North", EMI: 12500, Outstanding: 245000, DPD: 12, Disposition: "PTP", PaymentLink: "Link clicked", ExperianScore: 702, Channel: "AI Voice", PTPDate: "2026-10-10", PTPAmount: 12500, RecoveredAmount: 0, RecoveredAt: "" },
    { BorrowerID: "B1002", Name: "Priya Iyer", Phone: "9123456780", LoanID: "LN2024000456", Segment: "Pre Due", Portfolio: "Alpha NBFC", Region: "South", EMI: 8200, Outstanding: 98000, DPD: 0, Disposition: "Paid", PaymentLink: "Paid via link", ExperianScore: 781, Channel: "WhatsApp", PTPDate: "", PTPAmount: "", RecoveredAmount: 8200, RecoveredAt: "2026-10-02" },
  ]);
  add("Calls", [
    { Timestamp: "2026-10-02 11:20:00", Phone: "9876543210", LoanID: "LN2024000123", CallID: "call_abc123", Campaign: "KOLLECT_PD30_VOICE_HI", Portfolio: "Alpha NBFC", Channel: "AI Voice", DurationSec: 142, Disposition: "PTP", DropReason: "", AttemptNo: 2, Visible: "yes" },
    { Timestamp: "2026-10-02 11:42:00", Phone: "9123456780", LoanID: "LN2024000456", CallID: "call_abc124", Campaign: "KOLLECT_PD30_VOICE_HI", Portfolio: "Alpha NBFC", Channel: "AI Voice", DurationSec: 0, Disposition: "No Contact", DropReason: "no_answer", AttemptNo: 1, Visible: "yes" },
  ]);
  add("Agents", [
    { AgentName: "AI Voice (Hindi)", Code: "KOLLECT_PD30_VOICE_HI", Business: "Kollect", Product: "Personal Loan", Language: "Hindi", Voice: "Aarohi", Channel: "AI Voice", Live: 0, Max: 12 },
  ]);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
