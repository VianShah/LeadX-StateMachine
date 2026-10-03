import type { Role } from "./types";

export type ModuleKey = "home" | "performance" | "borrowers" | "channels" | "audit" | "usage" | "data";

export const MODULES: { key: ModuleKey; label: string; href: string }[] = [
  { key: "home", label: "Home", href: "/home" },
  { key: "performance", label: "Performance", href: "/performance" },
  { key: "borrowers", label: "Borrowers", href: "/borrowers" },
  { key: "channels", label: "Channels", href: "/channels" },
  { key: "audit", label: "Call Audit", href: "/audit" },
  { key: "usage", label: "Usage", href: "/usage" },
  { key: "data", label: "Data", href: "/data" },
];

export const ACCESS: Record<Role, ModuleKey[]> = {
  admin: ["home", "performance", "borrowers", "channels", "audit", "usage", "data"],
  supervisor: ["home", "performance", "borrowers", "channels", "audit", "usage"],
  operator: ["home", "borrowers", "audit"],
  client: ["home", "performance", "borrowers", "usage"],
};

export type Action = "sendLink" | "escalate" | "editCapacity" | "hideCall" | "upload";
export const CAN: Record<Action, Role[]> = {
  sendLink: ["admin", "supervisor", "operator"],
  escalate: ["admin", "supervisor", "operator"],
  editCapacity: ["admin", "supervisor"],
  hideCall: ["admin", "supervisor"],
  upload: ["admin"],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Super Admin",
  supervisor: "Supervisor",
  operator: "Operator",
  client: "Client",
};
