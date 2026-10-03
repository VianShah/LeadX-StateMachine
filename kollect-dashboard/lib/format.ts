export const inr = (n: number) => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};
export const inrFull = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const pct = (n: number) => `${n.toFixed(1)}%`;
export const num = (n: number) => Math.round(n).toLocaleString("en-IN");
export const dt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const d = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";
