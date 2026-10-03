import { NextResponse } from "next/server";
import { COOKIE, USERS, makeToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const u = USERS.find((x) => x.username === username && x.password === password);
  if (!u) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const { password: _pw, ...user } = u;
  const res = NextResponse.json({ user });
  res.cookies.set(COOKIE, makeToken(user), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 3600 });
  return res;
}
