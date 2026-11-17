"use client";

import Link from "next/link";
import { useState } from "react";
import { Icons } from "@/components/brand";
import { PageFrame, SESSION_CHANGED, fieldClass, labelClass } from "@/components/chrome";
import { apiFetch, completeSignIn, jsonInit } from "@/lib/client";

export default function DrivePage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
          role: "driver",
          name: String(form.get("dname") ?? ""),
          email: String(form.get("demail") ?? ""),
          phone: String(form.get("dphone") ?? ""),
          password: String(form.get("dpassword") ?? ""),
          city: String(form.get("dcity") ?? ""),
          vehicleType: String(form.get("dvehicleType") ?? "sedan"),
          vehicleModel: String(form.get("dcar") ?? ""),
          vehicleNumber: String(form.get("dplate") ?? ""),
          licenseNumber: String(form.get("dlicense") ?? ""),
        }),
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Unable to submit your application right now.");
        return;
      }
      await completeSignIn(data.token);
      setDone(true);
      window.dispatchEvent(new Event(SESSION_CHANGED));
    } catch {
      setError("Unable to reach RideX right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame kicker="Drive with us" title={<>Earn on your terms with <span className="text-brand">RideX</span></>} intro="Join the driver network behind safe trips. Apply in a couple of minutes and start earning once you're verified." wide>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)]">
        {done ? (
          <div className="rounded-2xl border border-hairline bg-white p-8">
            <p className="font-display text-2xl font-semibold text-ink">Application received</p>
            <p className="mt-3 text-body">Your driver account is created and awaiting verification by a RideX admin. Open the driver dashboard to track your approval — Go Online unlocks the moment you are approved.</p>
            <Link href="/driver" className="rx-btn rx-btn-primary mt-6 h-12 px-7">
              Go to driver dashboard <Icons.ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="dname" label="Full name" placeholder="Karthik R." />
              <Field id="dphone" label="Mobile number" placeholder="+91 98765 43210" type="tel" />
              <Field id="demail" label="Email address" placeholder="driver@example.com" type="email" />
              <Field id="dpassword" label="Password" placeholder="At least 6 characters" type="password" minLength={6} />
              <Field id="dcity" label="City" placeholder="Chennai" />
              <div>
                <label className={labelClass} htmlFor="dvehicleType">Vehicle type</label>
                <select id="dvehicleType" name="dvehicleType" defaultValue="sedan" className={`${fieldClass} mt-2`}>
                  <option value="mini">RideX Mini</option>
                  <option value="sedan">RideX Sedan</option>
                  <option value="suv">RideX SUV</option>
                </select>
              </div>
              <Field id="dcar" label="Vehicle model" placeholder="Toyota Sedan, 2022" />
              <Field id="dplate" label="Vehicle number" placeholder="TN 09 AB 1234" />
              <div className="sm:col-span-2">
                <Field id="dlicense" label="Driving licence number" placeholder="TN 09 20220012345" />
              </div>
            </div>
            {error ? <p role="alert" className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-medium text-brand-dark">{error}</p> : null}
            <button type="submit" disabled={busy} className="rx-btn rx-btn-primary mt-6 h-12 px-8">
              {busy ? "Submitting…" : "Submit Application"}
            </button>
          </form>
        )}
        <aside className="space-y-4">
          {[
            ["Weekly payouts", "Settle every Sunday, straight to your bank."],
            ["Your own hours", "Go online whenever it suits you."],
            ["Verified riders", "Every trip is tracked end to end."],
          ].map(([title, copy]) => (
            <article key={title} className="rounded-2xl border border-hairline bg-white p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
              <p className="mt-1 text-[0.92rem] text-body">{copy}</p>
            </article>
          ))}
          <p className="text-[0.95rem] text-body">
            Already driving with RideX? <Link href="/login" className="font-semibold text-brand">Log in</Link> to see your trips, ratings and weekly earnings.
          </p>
        </aside>
      </div>
    </PageFrame>
  );
}

function Field({ id, label, placeholder, type = "text", minLength }: { id: string; label: string; placeholder: string; type?: string; minLength?: number }) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      <input id={id} name={id} type={type} required minLength={minLength} placeholder={placeholder} className={`${fieldClass} mt-2`} />
    </div>
  );
}
