"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO = ["admin", "supervisor", "operator", "client"];

export default function Login() {
  const router = useRouter();
  const [username, setU] = useState("admin");
  const [password, setP] = useState("kollect123");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    setBusy(false);
    if (res.ok) { router.replace("/home"); router.refresh(); } else setErr("Invalid username or password");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h1 className="text-xl font-bold">Kollect</h1>
          <p className="text-sm text-slate-500">by Predixion AI · Sign in to your command center</p>
        </div>
        <label className="block text-sm">Username
          <input className="input mt-1 w-full" value={username} onChange={(e) => setU(e.target.value)} />
        </label>
        <label className="block text-sm">Password
          <input type="password" className="input mt-1 w-full" value={password} onChange={(e) => setP(e.target.value)} />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Demo users (password <code>kollect123</code>):
          <div className="mt-1 flex flex-wrap gap-1">
            {DEMO.map((u) => <button type="button" key={u} className="rounded border bg-white px-2 py-0.5 hover:bg-slate-100" onClick={() => { setU(u); setP("kollect123"); }}>{u}</button>)}
          </div>
        </div>
      </form>
    </main>
  );
}
