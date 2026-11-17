"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icons } from "@/components/brand";
import { PageFrame, fieldClass, labelClass } from "@/components/chrome";
import { apiFetch, jsonInit } from "@/lib/client";

export default function AdminSetupPage() {
  const [status, setStatus] = useState<{ open: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/setup")
      .then((response) => response.json())
      .then((data) => setStatus({ open: !!data.open, reason: data.reason ?? null }))
      .catch(() => setStatus({ open: false, reason: "Unable to reach RideX right now." }));
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch(
        "/api/admin/setup",
        jsonInit("POST", {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          confirmPassword: String(form.get("confirmPassword") ?? ""),
          setupCode: String(form.get("setupCode") ?? ""),
        }),
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error ?? "Setup could not be completed.");
      else setDone(data.message ?? "Administrator account created.");
    } catch {
      setError("Unable to reach RideX right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame kicker="RideX admin" title={<>First-admin <span className="text-brand">setup</span></>} intro="Creates the very first administrator. This page closes for good as soon as an administrator exists.">
      {!status ? <p className="rounded-2xl border border-hairline bg-white p-6 text-body">Checking setup status…</p> : null}
      {status && !status.open && !done ? (
        <div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
          <p className="font-display text-xl font-semibold text-ink">Setup is not available</p>
          <p className="mt-2 text-body">{status.reason}</p>
          <Link href="/admin/login" className="rx-btn rx-btn-primary mt-6 h-12 px-7">
            Admin Login <Icons.ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
      {done ? (
        <div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
          <p className="font-display text-xl font-semibold text-ink">{done}</p>
          <Link href="/admin/login" className="rx-btn rx-btn-primary mt-6 h-12 px-7">
            Go to Admin Login <Icons.ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
      {status?.open && !done ? (
        <form onSubmit={onSubmit} className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
          <label className={labelClass} htmlFor="name">Administrator name</label>
          <input id="name" name="name" required autoComplete="name" className={`${fieldClass} mt-2`} />
          <label className={`${labelClass} mt-4`} htmlFor="email">Admin e-mail</label>
          <input id="email" name="email" type="email" required autoComplete="username" className={`${fieldClass} mt-2`} />
          <label className={`${labelClass} mt-4`} htmlFor="password">Password (at least 10 characters)</label>
          <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className={`${fieldClass} mt-2`} />
          <label className={`${labelClass} mt-4`} htmlFor="confirmPassword">Confirm password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" className={`${fieldClass} mt-2`} />
          <label className={`${labelClass} mt-4`} htmlFor="setupCode">Setup code</label>
          <input id="setupCode" name="setupCode" type="password" required autoComplete="off" className={`${fieldClass} mt-2`} />
          <p className="mt-2 text-[0.82rem] text-body">The setup code is the ADMIN_SETUP_CODE value configured on the server.</p>
          {error ? <p role="alert" className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-medium text-brand-dark">{error}</p> : null}
          <button type="submit" disabled={busy} className="rx-btn rx-btn-primary mt-6 h-12 w-full">
            {busy ? "Creating…" : "Create administrator"} <Icons.ArrowRight className="h-4 w-4" />
          </button>
        </form>
      ) : null}
    </PageFrame>
  );
}
