"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icons } from "@/components/brand";
import { PageFrame, fieldClass, labelClass } from "@/components/chrome";
import { apiFetch, completeSignIn, jsonInit, storeToken } from "@/lib/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  // The setup link only appears while no administrator exists and setup is enabled.
  useEffect(() => {
    apiFetch("/api/admin/setup")
      .then((response) => response.json())
      .then((data) => setSetupOpen(!!data.open))
      .catch(() => setSetupOpen(false));
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/auth/login", jsonInit("POST", { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Unable to reach RideX right now.");
        return;
      }
      if (data.user?.role !== "admin") {
        await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        storeToken(null);
        setError(data.user?.role === "driver" ? "This is a driver account. Use Log In to open your driver dashboard." : "This account doesn't have administrator access. Use the regular Log In page instead.");
        return;
      }
      await completeSignIn(data.token);
      router.replace("/admin");
    } catch {
      setError("Unable to reach RideX right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame kicker="RideX admin" title={<>Admin <span className="text-brand">login</span></>} intro="Sign in with a RideX admin account to manage customers, drivers and rides.">
      <form onSubmit={onSubmit} className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
        <label className={labelClass} htmlFor="email">Admin email</label>
        <input id="email" name="email" type="email" autoComplete="username" required placeholder="admin@company.com" className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`} htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" className={`${fieldClass} mt-2`} />
        {error ? <p role="alert" className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-medium text-brand-dark">{error}</p> : null}
        <button type="submit" disabled={busy} className="rx-btn rx-btn-primary mt-6 h-12 w-full">
          {busy ? "Signing in…" : "Admin Login"} <Icons.ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-4 text-[0.86rem] leading-relaxed text-body">Admin sessions use the same secure login as every RideX account — there is no bypass and no default password on this form.</p>
        <p className="mt-4 text-[0.92rem] text-body">
          Not an admin? <Link href="/login" className="font-semibold text-brand">Regular Log In</Link>
        </p>
        {setupOpen ? (
          <p className="mt-2 text-[0.92rem] text-body">
            No administrator exists yet. <Link href="/admin/setup" className="font-semibold text-brand">Set up the first administrator</Link>
          </p>
        ) : null}
      </form>
      <Link href="/" className="mt-6 inline-flex text-[0.92rem] font-semibold text-ink-soft">← Back to home</Link>
    </PageFrame>
  );
}
