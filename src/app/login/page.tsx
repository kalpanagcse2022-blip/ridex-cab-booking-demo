"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icons } from "@/components/brand";
import { PageFrame, fieldClass, labelClass } from "@/components/chrome";
import { apiFetch, completeSignIn, jsonInit } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageNote, setStorageNote] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/auth/login", jsonInit("POST", { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Unable to log in right now.");
        return;
      }
      const { persists } = await completeSignIn(data.token);
      setStorageNote(!persists);
      const role = data.user?.role;
      router.push(role === "admin" ? "/admin" : role === "driver" ? "/driver" : "/rides");
      router.refresh();
    } catch {
      setError("Unable to reach RideX right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame kicker="Welcome back" title={<>Log in to <span className="text-brand">RideX</span></>} intro="Access your bookings, saved addresses and live rides from any device.">
      <form onSubmit={onSubmit} className="rounded-2xl border border-hairline bg-white p-6 shadow-[0_28px_60px_-46px_rgba(22,35,63,0.45)] sm:p-8">
        <label className={labelClass} htmlFor="email">Email address</label>
        <div className="relative mt-2">
          <Icons.Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input id="email" name="email" type="email" required autoComplete="username" placeholder="you@example.com" className={`${fieldClass} pl-10`} />
        </div>
        <label className={`${labelClass} mt-4`} htmlFor="password">Password</label>
        <div className="relative mt-2">
          <Icons.Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input id="password" name="password" type="password" required minLength={6} autoComplete="current-password" placeholder="••••••••" className={`${fieldClass} pl-10`} />
        </div>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-medium text-brand-dark">{error}</p> : null}
        {storageNote ? <p className="mt-3 text-[0.82rem] text-body">This browser blocked local session storage. Your login cookie will still be used for this visit.</p> : null}
        <button type="submit" disabled={busy} className="rx-btn rx-btn-primary mt-6 h-12 w-full">
          {busy ? "Signing in…" : "Log In"} <Icons.ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-5 text-[0.92rem] text-body">
          New to RideX? <Link href="/signup" className="font-semibold text-brand">Sign Up</Link>
        </p>
        <p className="mt-2 text-[0.92rem] text-body">
          Driving with RideX? <Link href="/drive" className="font-semibold text-brand">Apply or open the driver dashboard</Link>
        </p>
      </form>
      <Link href="/" className="mt-6 inline-flex text-[0.92rem] font-semibold text-ink-soft">← Back to home</Link>
    </PageFrame>
  );
}
