export type Role = "admin" | "supervisor" | "operator" | "client";
export type Segment = "Pre Due" | "Post Due (0–30)" | "Post Due (30–90)";
export type Disposition = "Paid" | "PTP" | "Partial" | "Callback" | "Dispute" | "No Contact" | "Escalated";
export type LinkStatus = "Not shared" | "Shared" | "Link clicked" | "Paid via link";
export type Channel = "AI Voice" | "WhatsApp" | "Human Desk";

export interface Borrower {
  id: string;
  name: string;
  phone: string; // masked
  loanId: string;
  segment: Segment;
  portfolio: string;
  region: string;
  emi: number;
  outstanding: number;
  dpd: number;
  disposition: Disposition;
  stage: 0 | 1 | 2 | 3 | 4; // assigned, contacted, engaged, PTP, recovered
  paymentLink: LinkStatus;
  experian: number;
  channel: Channel;
  ptpDate?: string;
  ptpAmount?: number;
  ptpOutcome?: "kept" | "broken" | "pending";
  recoveredAmount: number;
  recoveredAt?: string;
}

export interface Call {
  id: string;
  ts: string;
  phone: string;
  loanId: string;
  callId: string;
  campaign: string;
  portfolio: string;
  channel: Channel;
  durationSec: number;
  classification: Disposition;
  connected: boolean;
  dropReason?: string;
  attemptNo: number;
  visible: boolean;
}

export interface Agent {
  id: string;
  name: string;
  code: string;
  business: string;
  product: string;
  language: string;
  voice: string;
  channel: Channel;
  live: number;
  max: number;
  resolved: number;
  open: number;
}

export interface Store {
  borrowers: Borrower[];
  calls: Call[];
  agents: Agent[];
  globalMax: number;
  source: "mock" | "excel" | "api";
  updatedAt: string;
}

export interface Filters {
  range: "today" | "7d" | "30d" | "mtd" | "custom";
  from?: string;
  to?: string;
  portfolio?: string;
  channel?: string;
}

export interface Scope {
  portfolio?: string; // client users are pinned to a portfolio
  visibleOnly?: boolean;
}
