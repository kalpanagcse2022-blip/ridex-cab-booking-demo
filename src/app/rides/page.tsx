"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icons } from "@/components/brand";
import { PaymentBadge, RideStatusPill, RouteTimeline } from "@/components/ride-ui";
import { CustomerShell, Panel } from "@/components/shells";
import { apiFetch } from "@/lib/client";
import { formatMoney, methodLabel } from "@/lib/constants";

type Ride = {
  id: string;
  code: string;
  status: string;
  pickup: string;
  destination: string;
  vehicleType: string;
  fare: number;
  distanceKm: number;
  requestedAt: string;
  completedAt: string | null;
  payment: { method: string | null; status: string; amount: number };
  driver?: { name?: string } | null;
};

const FILTERS = ["ALL", "ACTIVE", "COMPLETED", "CANCELLED"] as const;

export default function RidesPage() {
  return (
    <CustomerShell title="My Rides" subtitle="Your ride history and past trips">
      <RideList />
    </CustomerShell>
  );
}

function RideList() {
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await apiFetch("/api/rides");
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
          setError(data.error ?? "Unable to load your rides.");
          return;
        }
        setRides(data.rides ?? []);
        setError(null);
      } catch {
        if (active) setError("Unable to reach RideX. Check your connection and try again.");
      }
    };
    void load();
    const timer = window.setInterval(load, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const visible = useMemo(() => {
    const rows = rides ?? [];
    return rows.filter((ride) => {
      if (filter === "ALL") return true;
      if (filter === "COMPLETED") return ride.status === "COMPLETED";
      if (filter === "CANCELLED") return ride.status === "CANCELLED";
      return !["COMPLETED", "CANCELLED"].includes(ride.status);
    });
  }, [rides, filter]);

  if (error) return <Panel><p role="alert">{error}</p></Panel>;
  if (!rides) return <Panel>Loading your rides…</Panel>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`rounded-full border px-4 py-2 text-[0.85rem] font-semibold transition-colors ${filter === item ? "border-brand bg-brand text-white" : "border-hairline bg-white text-ink-soft hover:border-brand/50"}`}>
            {item === "ALL" ? "All" : item === "ACTIVE" ? "Active" : item[0] + item.slice(1).toLowerCase()}
          </button>
        ))}
        <Link href="/book" className="rx-btn rx-btn-primary ml-auto h-10 px-5 text-[0.9rem]">
          Book a Ride
        </Link>
      </div>
      {visible.length === 0 ? (
        <Panel>
          <p className="font-display text-xl font-semibold text-ink">No rides match these filters.</p>
          <p className="mt-2">Book a ride and it will show up here with fare, status and payment details.</p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {visible.map((ride) => (
            <Link key={ride.id} href={`/rides/${ride.id}`} data-testid="ride-item" className="block rounded-2xl border border-hairline bg-white p-5 shadow-[0_18px_40px_-36px_rgba(22,35,63,0.5)] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_26px_48px_-32px_rgba(22,35,63,0.45)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-muted">
                    {ride.code} <span className="font-normal normal-case tracking-normal">· {new Date(ride.requestedAt).toLocaleString()}</span>
                  </p>
                  <RouteTimeline className="mt-3" pickup={ride.pickup} destination={ride.destination} />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="font-display text-[1.5rem] font-extrabold leading-none text-ink">{formatMoney(ride.fare)}</p>
                  <RideStatusPill status={ride.status} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-[0.78rem] font-semibold text-ink-soft">
                <PaymentBadge testId="ride-payment" role="customer" rideStatus={ride.status} payment={ride.payment} />
                <span className="rounded-full bg-panel px-2.5 py-1">{methodLabel(ride.payment.method)}</span>
                <span className="rounded-full bg-panel px-2.5 py-1">{ride.distanceKm.toFixed(1)} km</span>
                <span className="rounded-full bg-panel px-2.5 py-1">{ride.vehicleType.toUpperCase()}</span>
                {ride.driver?.name ? <span className="rounded-full bg-panel px-2.5 py-1">Driver {ride.driver.name}</span> : null}
                <Icons.ArrowRight className="ml-auto h-4 w-4 text-brand" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
