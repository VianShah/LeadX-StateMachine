import crypto from "crypto";
import { cookies } from "next/headers";
import type { Role } from "./types";
import { CAN, type Action } from "./roles";

export interface SessionUser { username: string; name: string; role: Role; portfolio?: string }

const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
export const COOKIE = "kollect_session";

export const USERS: (SessionUser & { password: string })[] = [
  { username: "admin", password: "kollect123", name: "Asha Admin", role: "admin" },
  { username: "supervisor", password: "kollect123", name: "Sam Supervisor", role: "supervisor" },
  { username: "operator", password: "kollect123", name: "Omar Operator", role: "operator" },
  { username: "client", password: "kollect123", name: "Alpha NBFC (Client)", role: "client", portfolio: "Alpha NBFC" },
];

const sign = (payload: string) => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

export function makeToken(u: SessionUser) {
  const payload = Buffer.from(JSON.stringify({ ...u, exp: Date.now() + 8 * 3600_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseToken(token?: string): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const { exp, ...u } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return exp > Date.now() ? (u as SessionUser) : null;
  } catch { return null; }
}

export async function getSession(): Promise<SessionUser | null> {
  return parseToken((await cookies()).get(COOKIE)?.value);
}

export function scopeFor(u: SessionUser) {
  return u.role === "client" ? { portfolio: u.portfolio, visibleOnly: true } : {};
}

export const can = (u: SessionUser, a: Action) => CAN[a].includes(u.role);
