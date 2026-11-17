"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icons } from "@/components/brand";
import { PageFrame, fieldClass, labelClass } from "@/components/chrome";
import { apiFetch, completeSignIn, jsonInit } from "@/lib/client";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch(
        "/api/auth/signup",
        jsonInit("POST", {
          role: "customer",
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Unable to create your account right now.");
        return;
      }
      await completeSignIn(data.token);
      router.push("/book");
      router.refresh();
    } catch {
      setError("Unable to reach RideX right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame kicker="Create your account" title={<>Join <span className="text-brand">RideX</span> in a minute</>} intro="One account for booking rides, tracking drivers live and managing every trip you take.">
      <form onSubmit={onSubmit} className="rounded-2xl border border-hairline bg-white p-6 shadow-[0_28px_60px_-46px_rgba(22,35,63,0.45)] sm:p-8">
        <label className={labelClass} htmlFor="name">Full name</label>
        <input id="name" name="name" required placeholder="Priya Raman" className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`} htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required placeholder="you@example.com" className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`} htmlFor="phone">Mobile number</label>
        <input id="phone" name="phone" type="tel" required placeholder="+91 98765 43210" className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`} htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={6} placeholder="At least 6 characters" className={`${fieldClass} mt-2`} />
        {error ? <p role="alert" className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-medium text-brand-dark">{error}</p> : null}
        <button type="submit" disabled={busy} className="rx-btn rx-btn-primary mt-6 h-12 w-full">
          {busy ? "Creating account…" : "Sign Up"} <Icons.ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-5 text-[0.92rem] text-body">
          Already have an account? <Link href="/login" className="font-semibold text-brand">Log In</Link>
        </p>
      </form>
      <Link href="/" className="mt-6 inline-flex text-[0.92rem] font-semibold text-ink-soft">← Back to home</Link>
    </PageFrame>
  );
}
