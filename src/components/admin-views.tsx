"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountForm } from "@/components/account-form";
import { fieldClass } from "@/components/chrome";
import { LiveTracking } from "@/components/admin-live";
import { PaymentBadge } from "@/components/ride-ui";
import { AdminShell } from "@/components/shells";
import { apiFetch, jsonInit } from "@/lib/client";
import { STATUS_LABEL, formatMoney, positionState } from "@/lib/constants";

type AdminData = {
  stats: {
    customers: number;
    drivers: number;
    pendingDriverVerifications: number;
    rides: number;
    activeRides: number;
    completedRides: number;
    cancelledRides: number;
    pendingRides: number;
    onlineDrivers: number;
    activeDrivers: number;
    revenue: number;
    newCustomers30d: number;
    newDrivers30d: number;
    newRides30d: number;
    ridesByStatus: Record<string, number>;
  };
  customers: Customer[];
  drivers: Driver[];
  rides: Ride[];
  liveRides: Ride[];
  payments: Payment[];
  feedback: Feedback[];
  complaints: Complaint[];
  activity: Activity[];
  notifications: Note[];
  fares: Record<string, number>;
  warnings?: { legacyAdminPassword: boolean };
};

type Customer = { id: string; name: string; email: string; phone: string | null; city: string | null; status: string; createdAt: string; rideCount: number };
type Driver = {
  id: string; name: string; email: string; phone: string | null; city: string | null; createdAt: string;
  vehicleType: string; vehicleModel: string; vehicleNumber: string; licenseNumber: string;
  approvalStatus: string; accessGranted: boolean; online: boolean; rating: number | null; ratingCount: number;
  decisionNote: string | null; decidedAt: string | null; lat: number | null; lng: number | null; locationUpdatedAt: string | null;
  rideCount: number; hasActiveRide: boolean; earnings: number;
};
type Ride = {
  id: string; code: string; status: string; pickup: string; destination: string; pickupLat: number; pickupLng: number;
  destinationLat: number; destinationLng: number; vehicleType: string; distanceKm: number; durationMin: number; fare: number;
  route: [number, number][]; requestedAt: string; customer: { id: string; name: string; email?: string } | null;
  driver: { id: string; name: string } | null; payment: { method: string | null; methodLabel: string; status: string; amount: number; adminMessage: string; reference: string | null; notice: string };
  driverLat: number | null; driverLng: number | null; driverSeenAt: string | null; customerRating: number | null; customerFeedback: string | null;
};
type Payment = { id: string; code: string; customer: { name: string } | null; driver: { name: string } | null; method: string; methodLabel: string; amount: number; status: string; reference: string; note: string | null; createdAt: string; rideStatus: string | null; demo: boolean };
type Feedback = { id: string; code: string | null; customer: { name: string } | null; driver: { name: string } | null; rating: number; comment: string | null; createdAt: string; pickup: string | null; destination: string | null };
type Complaint = { id: string; code: string | null; customer: { name: string } | null; driver: { name: string } | null; description: string; status: string; resolution: string | null; createdAt: string };
type Activity = { id: string; action: string; detail: string | null; createdAt: string };
type Note = { id: string; title: string; body: string | null; read: boolean; createdAt: string };

const TITLES: Record<string, { kicker: string; title: string; intro: string }> = {
  dashboard: { kicker: "Dashboard", title: "Welcome, Admin", intro: "Every number is calculated from the live database. Select a card to open its list." },
  verification: { kicker: "Driver verification", title: "Driver verification", intro: "Approve, reject or withdraw access. Decisions are saved immediately." },
  drivers: { kicker: "Driver management", title: "Driver management", intro: "Profiles, vehicles, approval and online access." },
  rides: { kicker: "Ride management", title: "Ride management", intro: "Bookings, assigned drivers, fares, status and cancellations." },
  live: { kicker: "Live tracking", title: "Live tracking", intro: "Every driver with approval, online status and last-seen time; online drivers on the map; open rides with route and driver position. Missing or old locations are labelled, never invented." },
  customers: { kicker: "Customer management", title: "Customer management", intro: "Profiles, account status and recent bookings." },
  payments: { kicker: "Payments", title: "Payments & reports", intro: "DEMO — No real money transferred. Cash and demo records use the same fare." },
  feedback: { kicker: "Feedback", title: "Feedback & complaints", intro: "Ratings from completed trips and support complaints." },
  notifications: { kicker: "Activity", title: "Notifications", intro: "Admin alerts for bookings, approvals, payments and complaints." },
  settings: { kicker: "Settings", title: "Admin settings", intro: "Your profile, password and per-kilometre fares. New bookings use the saved rates." },
};

export function AdminViews({ view = "dashboard" }: { view?: string }) {
  const meta = TITLES[view] ?? TITLES.dashboard;
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  async function load() {
    try {
      const response = await apiFetch("/api/admin");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 403 ? "Admin access required. Sign in with a RideX admin account." : body.error ?? "Unable to load admin data.");
        return;
      }
      setData(body);
      setError(null);
    } catch {
      setError("Unable to reach RideX right now. Retrying…");
    }
  }

  useEffect(() => {
    // The Live Tracking page runs its own small, faster refresh (see admin-live.tsx).
    if (view === "live") return;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [view]);

  async function act(action: string, id: string, extra: Record<string, unknown> = {}) {
    setActing(true);
    setNotice(null);
    try {
      const response = await apiFetch("/api/admin", jsonInit("POST", { action, id, ...extra }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setNotice(body.error ?? "That action did not go through.");
      else setNotice(body.message ?? "Saved.");
      await load();
    } catch {
      setNotice("Unable to reach RideX right now. Nothing was changed.");
    } finally {
      setActing(false);
    }
  }

  return (
    <AdminShell kicker={meta.kicker} title={meta.title} intro={meta.intro}>
      {!data && !error && view !== "live" ? <p className="rounded-2xl border border-hairline bg-white p-8 text-body">Loading…</p> : null}
      {error ? (
        <div className="rounded-2xl border border-hairline bg-white p-8">
          <p className="font-display text-xl font-semibold text-ink">{error}</p>
          <Link href="/admin/login" className="rx-btn rx-btn-primary mt-5 h-11 px-6">Admin Login</Link>
        </div>
      ) : null}
      {data?.warnings?.legacyAdminPassword ? (
        <p role="alert" data-testid="legacy-password-warning" className="mb-4 rounded-xl border border-brand/40 bg-white px-4 py-3 text-[0.88rem] font-semibold text-brand-dark">
          Security: this administrator account still uses a password that earlier setup notes published. Change it now under{" "}
          <Link href="/admin/settings" className="underline">Admin Settings → Password</Link>.
        </p>
      ) : null}
      {notice ? <p className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-semibold text-brand-dark">{notice}</p> : null}
      {data && view === "dashboard" ? <Dashboard data={data} /> : null}
      {data && view === "verification" ? <Verification data={data} acting={acting} act={act} /> : null}
      {data && view === "drivers" ? <Drivers data={data} acting={acting} act={act} /> : null}
      {data && view === "customers" ? <Customers data={data} acting={acting} act={act} /> : null}
      {data && view === "rides" ? <Rides data={data} acting={acting} act={act} /> : null}
      {view === "live" ? <LiveTracking /> : null}
      {data && view === "payments" ? <Payments data={data} /> : null}
      {data && view === "feedback" ? <FeedbackView data={data} acting={acting} act={act} /> : null}
      {data && view === "notifications" ? <Notes data={data} /> : null}
      {data && view === "settings" ? <Settings data={data} onSaved={load} /> : null}
    </AdminShell>
  );
}

function Dashboard({ data }: { data: AdminData }) {
  const cards = [
    ["Total Customers", data.stats.customers, `+${data.stats.newCustomers30d} in the last 30 days`, "/admin/customers"],
    ["Total Drivers", data.stats.drivers, `${data.stats.onlineDrivers} online now · +${data.stats.newDrivers30d} in the last 30 days`, "/admin/drivers"],
    ["Pending Verifications", data.stats.pendingDriverVerifications, "Awaiting your decision", "/admin/verification"],
    ["Active Rides", data.stats.activeRides, "Assigned, arrived or in progress", "/admin/rides?status=ACTIVE"],
    ["Completed Rides", data.stats.completedRides, "Trips finished", "/admin/rides?status=COMPLETED"],
    ["Cancelled Rides", data.stats.cancelledRides, "Cancelled by rider, driver or admin", "/admin/rides?status=CANCELLED"],
    ["Pending Ride Requests", data.stats.pendingRides, "Waiting for a driver", "/admin/rides?status=REQUESTED"],
    ["Total Revenue", formatMoney(data.stats.revenue), "Fare total from completed trips · demo, no real transfer", "/admin/payments"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, sub, href]) => (
          <Link key={String(label)} href={String(href)} data-testid="stat-card" data-label={label} className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_18px_36px_-30px_rgba(22,35,63,0.45)]">
            <p className="text-[0.82rem] font-semibold text-muted">{label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-ink">{value}</p>
            <p className="mt-1 text-[0.8rem] text-body">{sub}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Recent rides</h2>
          {data.rides.length === 0 ? <p className="mt-4 text-body">No bookings yet. They appear here as customers book rides.</p> : (
            <ul className="mt-3 divide-y divide-hairline">
              {data.rides.slice(0, 6).map((ride) => (
                <li key={ride.id} className="flex items-center justify-between gap-3 py-3 text-[0.9rem]">
                  <span>
                    <span className="font-semibold text-ink">{ride.code}</span>
                    <span className="block text-body">{ride.customer?.name ?? "Customer"} · {STATUS_LABEL[ride.status as keyof typeof STATUS_LABEL] ?? ride.status}</span>
                  </span>
                  <span className="font-semibold">{formatMoney(ride.fare)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Recent activity</h2>
          {data.activity.length === 0 ? <p className="mt-4 text-body">No activity yet.</p> : (
            <ul className="mt-3 space-y-3">
              {data.activity.slice(0, 8).map((item) => (
                <li key={item.id} className="text-[0.88rem]">
                  <p className="font-semibold text-ink">{item.detail}</p>
                  <p className="text-muted">{item.action} · {new Date(item.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Verification({ data, acting, act }: { data: AdminData; acting: boolean; act: (action: string, id: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pending");
  const rows = data.drivers.filter((driver) => {
    const text = `${driver.name} ${driver.email} ${driver.phone ?? ""} ${driver.vehicleNumber}`.toLowerCase();
    return (status === "all" || driver.approvalStatus === status) && text.includes(query.toLowerCase());
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["pending", "approved", "rejected", "all"].map((item) => (
          <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded-full px-4 py-2 text-[0.82rem] font-semibold capitalize ${status === item ? "bg-brand text-white" : "bg-white text-ink-soft"}`}>{item}</button>
        ))}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone or plate" className={`${fieldClass} ml-auto max-w-sm`} />
      </div>
      {rows.length === 0 ? <p className="rounded-2xl bg-white p-8 text-body">No applications match this search.</p> : rows.map((driver) => (
        <article key={driver.id} className="rounded-2xl border border-hairline bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold text-ink">{driver.name}</p>
              <p className="text-[0.9rem] text-body">{driver.email} · {driver.phone ?? "No phone"} · {driver.city}</p>
              <p className="mt-2 text-[0.9rem] text-ink">{driver.vehicleModel} · {driver.vehicleType.toUpperCase()} · {driver.vehicleNumber}</p>
              <p className="text-[0.86rem] text-body">Licence {driver.licenseNumber}</p>
              <p className="mt-1 text-[0.8rem] text-muted">Registered {new Date(driver.createdAt).toLocaleString()} · {driver.approvalStatus}{driver.accessGranted ? "" : " · access revoked"}</p>
              {driver.decisionNote ? <p className="mt-1 text-[0.84rem] text-body">{driver.decisionNote}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {driver.approvalStatus !== "approved" ? <button type="button" disabled={acting} onClick={() => act("approve", driver.id)} className="rx-btn rx-btn-primary h-10 px-4">{acting ? "Saving…" : "Approve"}</button> : null}
              {driver.approvalStatus !== "rejected" ? <button type="button" disabled={acting} onClick={() => act("reject", driver.id, { reason: window.prompt("Rejection reason") || "Application not approved" })} className="rx-btn rx-btn-ghost h-10 px-4">Reject</button> : null}
              {driver.approvalStatus === "approved" ? <button type="button" disabled={acting} onClick={() => window.confirm(`Withdraw approval for ${driver.name}?`) && act("withdraw", driver.id)} className="rx-btn rx-btn-ghost h-10 px-4">Withdraw approval</button> : null}
              {driver.approvalStatus === "approved" && driver.accessGranted ? <button type="button" disabled={acting} onClick={() => act("revoke", driver.id)} className="rx-btn rx-btn-ghost h-10 px-4">Revoke access</button> : null}
              {driver.approvalStatus === "approved" && !driver.accessGranted ? <button type="button" disabled={acting} onClick={() => act("grant", driver.id)} className="rx-btn rx-btn-primary h-10 px-4">Grant access</button> : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Drivers({ data, acting, act }: { data: AdminData; acting: boolean; act: (action: string, id: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Driver | null>(null);
  const rows = data.drivers.filter((driver) => `${driver.name} ${driver.email} ${driver.vehicleNumber} ${driver.vehicleModel}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-4">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone or vehicle" className={`${fieldClass} max-w-md`} />
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
        <table className="w-full min-w-[860px] text-left text-[0.88rem]">
          <thead className="text-[0.74rem] uppercase tracking-[0.06em] text-muted"><tr><th className="px-4 py-3">Driver</th><th>Vehicle</th><th>Verification</th><th>Access</th><th>Rating</th><th>Trips</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((driver) => (
              <tr key={driver.id} className="border-t border-hairline">
                <td className="px-4 py-3"><button type="button" className="font-semibold text-ink" onClick={() => setSelected(driver)}>{driver.name}</button><span className="block text-body">{driver.email}</span></td>
                <td>{driver.vehicleModel}<span className="block text-muted">{driver.vehicleType.toUpperCase()} · {driver.vehicleNumber}</span></td>
                <td className="capitalize">{driver.approvalStatus}</td>
                <td>{driver.accessGranted ? (driver.online ? "Online" : "Granted, offline") : "Revoked"}</td>
                <td>{driver.rating ? `★ ${driver.rating}` : "No ratings yet"}</td>
                <td>{driver.rideCount}</td>
                <td className="space-x-2 py-3">
                  <button type="button" disabled={acting || driver.approvalStatus !== "approved" || !driver.accessGranted} onClick={() => act("setOnline", driver.id, { online: !driver.online })} className="text-[0.82rem] font-semibold text-brand">{driver.online ? "Set offline" : "Set online"}</button>
                  {driver.accessGranted ? <button type="button" disabled={acting} onClick={() => act("revoke", driver.id)} className="text-[0.82rem] font-semibold text-ink-soft">Revoke</button> : <button type="button" disabled={acting || driver.approvalStatus !== "approved"} onClick={() => act("grant", driver.id)} className="text-[0.82rem] font-semibold text-brand">Grant</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <aside className="rounded-2xl border border-hairline bg-white p-5">
          <div className="flex justify-between"><h3 className="font-display text-xl font-semibold">{selected.name}</h3><button type="button" onClick={() => setSelected(null)}>Close</button></div>
          <p className="mt-2 text-body">{selected.email} · {selected.phone} · {selected.city}</p>
          <p className="mt-2">Licence {selected.licenseNumber}</p>
          <p>Earnings {formatMoney(selected.earnings)} · {selected.rideCount} trips</p>
          <p className="text-[0.84rem] text-muted">Location {selected.locationUpdatedAt ? `${positionState(selected.locationUpdatedAt) === "live" ? "live" : "last known"} ${new Date(selected.locationUpdatedAt).toLocaleTimeString()}` : "not shared"}</p>
        </aside>
      ) : null}
    </div>
  );
}

function Customers({ data, acting, act }: { data: AdminData; acting: boolean; act: (action: string, id: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = data.customers.filter((customer) => `${customer.name} ${customer.email} ${customer.phone ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const history = data.rides.filter((ride) => ride.customer?.id === selected);
  return (
    <div className="space-y-4">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or phone" className={`${fieldClass} max-w-md`} />
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
        <table className="w-full min-w-[760px] text-left text-[0.88rem]">
          <thead className="text-[0.74rem] uppercase text-muted"><tr><th className="px-4 py-3">Customer</th><th>Contact</th><th>Bookings</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id} className="border-t border-hairline">
                <td className="px-4 py-3 font-semibold">{customer.name}</td>
                <td>{customer.email}<span className="block text-muted">{customer.phone ?? "No phone"}</span></td>
                <td>{customer.rideCount}</td>
                <td className="capitalize">{customer.status}</td>
                <td className="space-x-3">
                  <button type="button" className="font-semibold text-brand" onClick={() => setSelected(customer.id)}>View</button>
                  {customer.status === "active" ? <button type="button" disabled={acting} onClick={() => window.confirm(`Suspend ${customer.name}?`) && act("suspend", customer.id)}>Suspend</button> : <button type="button" disabled={acting} onClick={() => act("activate", customer.id)}>Reactivate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <h3 className="font-semibold">Booking history</h3>
          {history.length === 0 ? <p className="mt-2 text-body">No bookings yet.</p> : history.map((ride) => (
            <p key={ride.id} className="mt-2 text-[0.9rem]">{ride.code} · {ride.pickup} → {ride.destination} · {formatMoney(ride.fare)} · {ride.status}</p>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Rides({ data, acting, act }: { data: AdminData; acting: boolean; act: (action: string, id: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<Ride | null>(null);
  const eligible = data.drivers.filter((driver) => driver.approvalStatus === "approved" && driver.accessGranted && driver.online && !driver.hasActiveRide);
  const rows = data.rides.filter((ride) => {
    const active = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_RIDE"].includes(ride.status);
    if (status === "ACTIVE" && !active) return false;
    if (status !== "ALL" && status !== "ACTIVE" && ride.status !== status) return false;
    const text = `${ride.code} ${ride.pickup} ${ride.destination} ${ride.customer?.name ?? ""} ${ride.driver?.name ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["ALL", "REQUESTED", "ACTIVE", "COMPLETED", "CANCELLED"].map((item) => (
          <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded-full px-3 py-1.5 text-[0.78rem] font-semibold ${status === item ? "bg-brand text-white" : "bg-white"}`}>{item}</button>
        ))}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search booking ID, customer, driver, pickup or destination" className={`${fieldClass} min-w-[240px] flex-1`} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
        <table className="w-full min-w-[980px] text-left text-[0.86rem]">
          <thead className="text-[0.72rem] uppercase text-muted"><tr><th className="px-4 py-3">Booking</th><th>Route</th><th>Customer</th><th>Driver</th><th>Fare</th><th>Status</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-body">No bookings match these filters.</td></tr> : rows.map((ride) => (
              <tr key={ride.id} data-testid="ride-row" className="border-t border-hairline">
                <td className="px-4 py-3 font-semibold">{ride.code}<span className="block font-normal text-muted">{ride.vehicleType.toUpperCase()}</span></td>
                <td className="max-w-[220px]">{ride.pickup}<span className="block text-muted">→ {ride.destination}</span></td>
                <td>{ride.customer?.name ?? "Unknown customer"}</td>
                <td>{ride.driver?.name ?? "Not assigned"}</td>
                <td>{formatMoney(ride.fare)}</td>
                <td>{STATUS_LABEL[ride.status as keyof typeof STATUS_LABEL] ?? ride.status}</td>
                <td><PaymentBadge role="admin" rideStatus={ride.status} payment={ride.payment} /><span className="mt-1 block text-[0.75rem] text-muted">{ride.payment.methodLabel}</span></td>
                <td><button type="button" className="font-semibold text-brand" onClick={() => setSelected(ride)}>Details</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <div className="flex justify-between"><h3 className="font-display text-xl font-semibold">{selected.code}</h3><button type="button" onClick={() => setSelected(null)}>Close</button></div>
          <p className="mt-2 text-body">{selected.pickup} → {selected.destination}</p>
          <p className="mt-1">{selected.distanceKm.toFixed(1)} km · {selected.durationMin} min · {formatMoney(selected.fare)}</p>
          <p className="mt-1">Payment {selected.payment.adminMessage} · {selected.payment.reference ?? "no reference"} · {selected.payment.notice}</p>
          {selected.status === "REQUESTED" ? (
            <label className="mt-4 block text-[0.86rem] font-semibold">Assign driver
              <select className={`${fieldClass} mt-2`} defaultValue="" onChange={(event) => event.target.value && act("assignDriver", selected.id, { driverId: event.target.value })}>
                <option value="">Choose an approved online driver</option>
                {eligible.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driver.vehicleType}</option>)}
              </select>
            </label>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {selected.status === "DRIVER_ASSIGNED" ? <button type="button" disabled={acting} onClick={() => act("markArrived", selected.id)} className="rx-btn rx-btn-ghost h-10 px-4">Mark arrived</button> : null}
            {selected.status === "DRIVER_ARRIVED" ? <button type="button" disabled={acting} onClick={() => act("startTrip", selected.id)} className="rx-btn rx-btn-ghost h-10 px-4">Start trip</button> : null}
            {selected.status === "IN_RIDE" ? <button type="button" disabled={acting} onClick={() => act("completeTrip", selected.id)} className="rx-btn rx-btn-primary h-10 px-4">Complete trip</button> : null}
            {!["COMPLETED", "CANCELLED"].includes(selected.status) ? <button type="button" disabled={acting} onClick={() => window.confirm(`Cancel ${selected.code}?`) && act("cancelRide", selected.id)} className="rx-btn rx-btn-ghost h-10 px-4">Cancel</button> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Payments({ data }: { data: AdminData }) {
  const [query, setQuery] = useState("");
  const rows = data.payments.filter((payment) => `${payment.code} ${payment.customer?.name ?? ""} ${payment.driver?.name ?? ""} ${payment.reference}`.toLowerCase().includes(query.toLowerCase()));
  const paid = data.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + payment.amount, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Recorded paid amount" value={formatMoney(paid)} />
        <Stat label="Payment records" value={String(data.payments.length)} />
        <Stat label="Pending" value={String(data.payments.filter((payment) => payment.status === "PENDING").length)} />
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search booking, customer or driver" className={`${fieldClass} max-w-md`} />
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
        <table className="w-full min-w-[860px] text-left text-[0.86rem]">
          <thead className="text-[0.72rem] uppercase text-muted"><tr><th className="px-4 py-3">Booking</th><th>Customer</th><th>Driver</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-body">No payments match these filters.</td></tr> : rows.map((payment) => (
              <tr key={payment.id} className="border-t border-hairline">
                <td className="px-4 py-3 font-semibold">{payment.code}</td>
                <td>{payment.customer?.name ?? "—"}</td>
                <td>{payment.driver?.name ?? "Not assigned"}</td>
                <td>{formatMoney(payment.amount)}</td>
                <td>{payment.methodLabel}</td>
                <td><PaymentBadge role="admin" rideStatus={payment.rideStatus} payment={{ status: payment.status, method: payment.method }} /></td>
                <td className="text-body">{payment.reference}<span className="block text-[0.75rem]">{payment.note}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComplaintCard({ item, acting, act }: { item: Complaint; acting: boolean; act: (action: string, id: string, extra?: Record<string, unknown>) => Promise<void> }) {
  // Each complaint keeps its own notes, so typing on one never changes another.
  const [resolution, setResolution] = useState(item.resolution ?? "");
  const resolved = item.status === "RESOLVED";
  return (
    <article data-testid="complaint" data-complaint={item.id} className="mt-4 border-t border-hairline pt-3">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        {item.code ?? "No ride"}
        <span data-testid="complaint-status" className={`rounded-full border px-2 py-0.5 text-[0.72rem] font-semibold ${resolved ? "border-green-200 bg-green-50 text-green-800" : item.status === "IN_REVIEW" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          {item.status.replace("_", " ")}
        </span>
      </p>
      <p className="mt-1 text-[0.9rem] text-body">{item.customer?.name}: {item.description}</p>
      {resolved ? (
        <p className="mt-2 rounded-xl bg-panel px-3 py-2 text-[0.86rem] text-ink-soft">Resolution: {item.resolution}</p>
      ) : (
        <>
          <textarea value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Resolution notes" className={`${fieldClass} mt-2`} />
          <div className="mt-2 flex gap-4">
            {item.status !== "IN_REVIEW" ? <button type="button" disabled={acting} onClick={() => act("updateComplaint", item.id, { status: "IN_REVIEW", resolution })} className="text-[0.82rem] font-semibold text-brand">In review</button> : null}
            <button type="button" disabled={acting} onClick={() => act("updateComplaint", item.id, { status: "RESOLVED", resolution })} className="text-[0.82rem] font-semibold text-ink">Resolve</button>
          </div>
        </>
      )}
    </article>
  );
}

function FeedbackView({ data, acting, act }: { data: AdminData; acting: boolean; act: (action: string, id: string, extra?: Record<string, unknown>) => Promise<void> }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-hairline bg-white p-5">
        <h2 className="font-display text-lg font-semibold">Ratings</h2>
        {data.feedback.length === 0 ? <p className="mt-3 text-body">No ratings yet. Ratings appear after customers rate completed trips.</p> : data.feedback.map((item) => (
          <article key={item.id} className="mt-4 border-t border-hairline pt-3 text-[0.9rem]">
            <p className="font-semibold">{item.code} · ★ {item.rating}/5</p>
            <p className="text-body">{item.customer?.name} on {item.driver?.name ?? "unassigned driver"}</p>
            <p>{item.comment || "No comment"}</p>
            <p className="text-[0.78rem] text-muted">{item.pickup} → {item.destination}</p>
          </article>
        ))}
      </section>
      <section className="rounded-2xl border border-hairline bg-white p-5">
        <h2 className="font-display text-lg font-semibold">Complaints</h2>
        {data.complaints.length === 0 ? <p className="mt-3 text-body">No complaints yet. Complaints sent from a ride page appear here.</p> : data.complaints.map((item) => (
          <ComplaintCard key={item.id} item={item} acting={acting} act={act} />
        ))}
      </section>
    </div>
  );
}

function Notes({ data }: { data: AdminData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-hairline bg-white p-5">
        <h2 className="font-semibold">Notifications</h2>
        {data.notifications.length === 0 ? <p className="mt-3 text-body">No notifications yet.</p> : data.notifications.map((note) => (
          <article key={note.id} className={`mt-3 rounded-xl px-3 py-3 ${note.read ? "bg-panel" : "bg-brand-soft"}`}>
            <p className="font-semibold">{note.title}</p>
            <p className="text-[0.86rem] text-body">{note.body}</p>
            <p className="text-[0.75rem] text-muted">{new Date(note.createdAt).toLocaleString()}</p>
          </article>
        ))}
      </section>
      <section className="rounded-2xl border border-hairline bg-white p-5">
        <h2 className="font-semibold">Activity</h2>
        {data.activity.map((item) => (
          <p key={item.id} className="mt-3 text-[0.88rem]"><span className="font-semibold">{item.detail}</span><span className="block text-muted">{item.action} · {new Date(item.createdAt).toLocaleString()}</span></p>
        ))}
      </section>
    </div>
  );
}

function Settings({ data, onSaved }: { data: AdminData; onSaved: () => Promise<void> }) {
  const [fares, setFares] = useState(data.fares);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch("/api/admin/fares", jsonInit("POST", fares));
      const body = await response.json();
      if (!response.ok) setMessage(body.error ?? "Fares could not be saved.");
      else {
        setMessage(body.message);
        await onSaved();
      }
    } catch {
      setMessage("Unable to reach RideX. Fares were not changed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
    <section>
      <h2 className="mb-3 font-display text-xl font-semibold text-ink">Admin profile & password</h2>
      <AccountForm showPayments={false} />
    </section>
    <form onSubmit={save} className="max-w-xl rounded-2xl border border-hairline bg-white p-6">
      <h2 className="font-display text-xl font-semibold text-ink">Fares</h2>
      <p className="mt-1 text-[0.9rem] text-body">Per-kilometre fares. Existing bookings keep the fare they were booked at.</p>
      {(["mini", "sedan", "suv"] as const).map((key) => (
        <label key={key} className="mt-4 block text-[0.85rem] font-semibold capitalize">
          RideX {key} ₹/km
          <input type="number" min={1} max={500} value={fares[key] ?? ""} onChange={(event) => setFares((current) => ({ ...current, [key]: Number(event.target.value) }))} className={`${fieldClass} mt-2`} />
        </label>
      ))}
      {message ? <p className="mt-4 text-[0.86rem] font-medium text-brand-dark">{message}</p> : null}
      <button disabled={busy} className="rx-btn rx-btn-primary mt-5 h-11 px-6">{busy ? "Saving…" : "Update fares"}</button>
      <p className="mt-6 text-[0.84rem] text-body">Maps use OpenStreetMap tiles, Nominatim geocoding and the public OSRM demo router. No map API key is stored in the app. Set NOMINATIM_USER_AGENT if you deploy this beyond a local demo.</p>
    </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-hairline bg-white p-4"><p className="text-[0.78rem] text-muted">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p></div>;
}
