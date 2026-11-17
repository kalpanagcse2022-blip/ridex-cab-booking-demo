"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fieldClass, labelClass, useSession } from "@/components/chrome";
import { apiFetch, jsonInit } from "@/lib/client";
import { formatMoney } from "@/lib/constants";

type Payment = { id: string; rideId: string; code: string; methodLabel: string; amount: number; status: string; reference: string; message: string; createdAt: string; note: string | null; demo: boolean };

// Profile, password and (optionally) payment history for whoever is signed in. Shared by
// the customer/driver profile page and the admin Settings screen.
export function AccountForm({ showPayments = true }: { showPayments?: boolean }) {
  const { user } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [vehicleType, setVehicleType] = useState(user?.driver?.vehicleType ?? "sedan");
  const [vehicleModel, setVehicleModel] = useState(user?.driver?.vehicleModel ?? "");
  const [vehicleNumber, setVehicleNumber] = useState(user?.driver?.vehicleNumber ?? "");
  const [licenseNumber, setLicenseNumber] = useState(user?.driver?.licenseNumber ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      setName(user.name);
      setPhone(user.phone ?? "");
      setCity(user.city ?? "");
      setVehicleType(user.driver?.vehicleType ?? "sedan");
      setVehicleModel(user.driver?.vehicleModel ?? "");
      setVehicleNumber(user.driver?.vehicleNumber ?? "");
      setLicenseNumber(user.driver?.licenseNumber ?? "");
    }, 0);
    if (showPayments) {
      apiFetch("/api/account")
        .then((response) => response.json())
        .then((data) => setPayments(data.payments ?? []))
        .catch(() => undefined);
    }
    return () => window.clearTimeout(timer);
  }, [user, showPayments]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch("/api/account", jsonInit("POST", { action: "profile", name, phone, city, vehicleType, vehicleModel, vehicleNumber, licenseNumber }));
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Your profile could not be saved.");
      else setMessage(data.message ?? "Profile saved.");
    } catch {
      setError("Unable to reach RideX. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch("/api/account", jsonInit("POST", { action: "password", currentPassword, newPassword, confirmPassword }));
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Password could not be changed.");
      else {
        setMessage(data.message ?? "Password changed.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Unable to reach RideX. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <form onSubmit={saveProfile} className="min-w-0 rounded-2xl border border-hairline bg-white p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Profile</h2>
        <label className={`${labelClass} mt-4`} htmlFor="name">Full name</label>
        <input id="name" value={name} onChange={(event) => setName(event.target.value)} className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`} htmlFor="phone">Mobile</label>
        <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`} htmlFor="city">City</label>
        <input id="city" value={city} onChange={(event) => setCity(event.target.value)} className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`}>Email</label>
        <input value={user?.email ?? ""} readOnly className={`${fieldClass} mt-2 bg-panel text-muted`} />
        {user?.role === "driver" ? (
          <div className="mt-4 grid gap-3">
            <label className={labelClass}>Vehicle type
              <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} className={`${fieldClass} mt-2`}>
                <option value="mini">RideX Mini</option>
                <option value="sedan">RideX Sedan</option>
                <option value="suv">RideX SUV</option>
              </select>
            </label>
            <input value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} placeholder="Vehicle model" className={fieldClass} />
            <input value={vehicleNumber} onChange={(event) => setVehicleNumber(event.target.value)} placeholder="Vehicle number" className={fieldClass} />
            <input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} placeholder="Licence number" className={fieldClass} />
          </div>
        ) : null}
        <button disabled={busy} className="rx-btn rx-btn-primary mt-5 h-11 px-6">{busy ? "Saving…" : "Save profile"}</button>
      </form>
      <form onSubmit={savePassword} className="min-w-0 rounded-2xl border border-hairline bg-white p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Password</h2>
        <label className={`${labelClass} mt-4`}>Current password</label>
        <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`}>New password (at least 8 characters)</label>
        <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required className={`${fieldClass} mt-2`} />
        <label className={`${labelClass} mt-4`}>Confirm new password</label>
        <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required className={`${fieldClass} mt-2`} />
        <button disabled={busy} className="rx-btn rx-btn-ghost mt-5 h-11 px-6">{busy ? "Updating…" : "Update password"}</button>
      </form>
      {message || error ? (
        <div className="xl:col-span-2">
          {message ? <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-[0.9rem] font-medium text-brand-dark">{message}</p> : null}
          {error ? <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-[0.9rem] font-medium text-brand-dark">{error}</p> : null}
        </div>
      ) : null}
      {showPayments ? (
        <section className="min-w-0 rounded-2xl border border-hairline bg-white p-6 xl:col-span-2">
          <h2 className="font-display text-xl font-semibold text-ink">Payment history</h2>
          <p className="mt-1 text-[0.86rem] text-body">DEMO — No real money transferred. Amounts match the booked fare.</p>
          {payments.length === 0 ? <p className="mt-4 text-body">No payments yet.</p> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[0.9rem]">
                <thead className="text-[0.75rem] uppercase tracking-[0.06em] text-muted">
                  <tr><th className="py-2">Ride</th><th>Method</th><th>Amount</th><th>Status</th><th>Reference</th><th>When</th></tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-hairline">
                      <td className="py-3 font-semibold"><Link href={`/rides/${payment.rideId}`} className="text-ink">{payment.code}</Link></td>
                      <td>{payment.methodLabel}</td>
                      <td>{formatMoney(payment.amount)}</td>
                      <td>{payment.message}</td>
                      <td className="text-body">{payment.reference}</td>
                      <td className="text-body">{new Date(payment.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
