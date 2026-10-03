import type { Agent, Borrower, Call, Channel, Disposition, LinkStatus, Segment, Store } from "./types";

// Seeded RNG so server and client fallback produce the same dataset.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PORTFOLIOS = ["Alpha NBFC", "Bharat Bank", "QuickPay BNPL"];
export const REGIONS = ["North", "South", "East", "West"];
const FIRST = ["Aarav", "Priya", "Rohan", "Sneha", "Vikram", "Anjali", "Karan", "Neha", "Rahul", "Pooja", "Amit", "Divya", "Suresh", "Kavita", "Manoj", "Ritu", "Arjun", "Meera", "Sanjay", "Isha"];
const LAST = ["Sharma", "Patel", "Singh", "Reddy", "Iyer", "Gupta", "Nair", "Joshi", "Verma", "Mehta", "Das", "Khan", "Rao", "Kulkarni", "Bose"];
const NO_CONTACT_REASONS = ["no_answer", "switched_off", "customer_busy", "call_rejected", "wrong_number"];

export const CAMPAIGNS: { code: string; channel: Channel }[] = [
  { code: "KOLLECT_PREDUE_WA", channel: "WhatsApp" },
  { code: "KOLLECT_PD30_VOICE_HI", channel: "AI Voice" },
  { code: "KOLLECT_PD30_VOICE_EN", channel: "AI Voice" },
  { code: "KOLLECT_PD90_VOICE_HI", channel: "AI Voice" },
  { code: "KOLLECT_ESC_HUMAN", channel: "Human Desk" },
];

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const DAY = 86400000;

export function generateStore(now = Date.now()): Store {
  const r = rng(42);
  const borrowers: Borrower[] = [];
  const N = 600;
  for (let i = 0; i < N; i++) {
    const segment: Segment = pick(r, ["Pre Due", "Post Due (0–30)", "Post Due (0–30)", "Post Due (30–90)"]);
    const dpd = segment === "Pre Due" ? 0 : segment === "Post Due (0–30)" ? 1 + Math.floor(r() * 29) : 31 + Math.floor(r() * 59);
    const emi = Math.round((4000 + r() * 46000) / 50) * 50;
    const outstanding = Math.round(emi * (3 + r() * 9));
    const x = r();
    const stage = (x < 0.3 ? 0 : x < 0.58 ? 1 : x < 0.76 ? 2 : x < 0.88 ? 3 : 4) as Borrower["stage"];
    let disposition: Disposition;
    if (stage === 0) disposition = "No Contact";
    else if (stage === 1) disposition = "Callback";
    else if (stage === 2) disposition = pick(r, ["Dispute", "Escalated", "Escalated", "Callback"]);
    else if (stage === 3) disposition = r() < 0.8 ? "PTP" : "Partial";
    else disposition = "Paid";

    const channel: Channel = disposition === "Escalated" ? "Human Desk" : pick(r, ["AI Voice", "AI Voice", "WhatsApp"]);
    let paymentLink: LinkStatus = "Not shared";
    if (stage >= 2) paymentLink = stage === 4 && r() < 0.55 ? "Paid via link" : pick(r, ["Shared", "Link clicked", "Not shared"]);
    const ptpDate = stage === 3 ? new Date(now + (r() * 10 - 2) * DAY).toISOString() : undefined;
    const recoveredAmount = stage === 4 ? Math.round(outstanding * (0.5 + r() * 0.5)) : stage === 3 && disposition === "Partial" ? Math.round(outstanding * 0.25) : 0;
    const ptpOutcome = stage === 3 ? pick(r, ["pending", "pending", "kept", "broken"] as const) : stage === 4 ? "kept" : undefined;
    borrowers.push({
      id: `B${1000 + i}`,
      name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
      phone: `+91 9${Math.floor(r() * 10)}••• ••${String(Math.floor(r() * 100)).padStart(2, "0")}`,
      loanId: `LN${String(2024000000 + Math.floor(r() * 999999))}`,
      segment,
      portfolio: pick(r, PORTFOLIOS),
      region: pick(r, REGIONS),
      emi,
      outstanding,
      dpd,
      disposition,
      stage,
      paymentLink,
      experian: 520 + Math.floor(r() * 330),
      channel,
      ptpDate,
      ptpAmount: stage === 3 ? emi : undefined,
      ptpOutcome,
      recoveredAmount,
      recoveredAt: recoveredAmount ? new Date(now - r() * 30 * DAY).toISOString() : undefined,
    });
  }

  const calls: Call[] = [];
  const DAYS = 45;
  let seq = 0;
  for (let day = DAYS - 1; day >= 0; day--) {
    const perDay = 70 + Math.floor(r() * 50);
    for (let k = 0; k < perDay; k++) {
      const b = borrowers[Math.floor(r() * borrowers.length)];
      const campaign = pick(r, CAMPAIGNS.filter((c) => (b.segment === "Pre Due" ? c.code.includes("PREDUE") : !c.code.includes("PREDUE"))));
      const connected = r() < 0.66;
      const hour = 9 + Math.floor(r() * 10);
      const ts = new Date(now - day * DAY);
      ts.setHours(hour, Math.floor(r() * 60), Math.floor(r() * 60));
      if (ts.getTime() > now) ts.setTime(now - 60000 * Math.floor(r() * 120));
      const classification: Disposition = connected
        ? pick(r, ["PTP", "PTP", "Paid", "Partial", "Callback", "Callback", "Dispute", "Escalated"])
        : "No Contact";
      calls.push({
        id: `C${++seq}`,
        ts: ts.toISOString(),
        phone: b.phone,
        loanId: b.loanId,
        callId: `call_${(100000 + seq * 7919).toString(36)}`,
        campaign: campaign.code,
        portfolio: b.portfolio,
        channel: campaign.channel,
        durationSec: connected ? 25 + Math.floor(r() * 260) : Math.floor(r() * 18),
        classification,
        connected,
        dropReason: connected ? undefined : pick(r, NO_CONTACT_REASONS),
        attemptNo: 1 + Math.floor(r() * r() * 5),
        visible: r() > 0.07,
      });
    }
  }
  calls.sort((a, b) => b.ts.localeCompare(a.ts));

  const agents: Agent[] = [
    { id: "A1", name: "WhatsApp Bot", code: "KOLLECT_PREDUE_WA", business: "Kollect", product: "Personal Loan", language: "English/Hindi", voice: "—", channel: "WhatsApp", live: 0, max: 12, resolved: 1, open: 1 },
    { id: "A2", name: "AI Voice (Hindi)", code: "KOLLECT_PD30_VOICE_HI", business: "Kollect", product: "Personal Loan", language: "Hindi", voice: "Aarohi", channel: "AI Voice", live: 5, max: 12, resolved: 0, open: 0 },
    { id: "A3", name: "AI Voice (English)", code: "KOLLECT_PD30_VOICE_EN", business: "Kollect", product: "BNPL", language: "English", voice: "Ethan", channel: "AI Voice", live: 2, max: 8, resolved: 2, open: 0 },
    { id: "A4", name: "AI Voice (Hindi 90+)", code: "KOLLECT_PD90_VOICE_HI", business: "Kollect", product: "Personal Loan", language: "Hindi", voice: "Aarohi", channel: "AI Voice", live: 0, max: 5, resolved: 0, open: 2 },
    { id: "A5", name: "Human Desk", code: "KOLLECT_ESC_HUMAN", business: "Kollect", product: "All", language: "Multi", voice: "—", channel: "Human Desk", live: 0, max: 5, resolved: 3, open: 4 },
  ];
  return { borrowers, calls, agents, globalMax: 25, source: "mock", updatedAt: new Date(now).toISOString() };
}
