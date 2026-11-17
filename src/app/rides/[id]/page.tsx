"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icons } from "@/components/brand";
import { RouteMap } from "@/components/MapView";
import { Avatar, PaymentBadge, PaymentCard, RideStatusCard, RouteTimeline } from "@/components/ride-ui";
import { CustomerShell, Panel } from "@/components/shells";
import { apiFetch, jsonInit } from "@/lib/client";
import { formatMoney, methodLabel, paymentPresentation, positionState, rideStage } from "@/lib/constants";
import { describeGps, useGpsShare, useLiveLeg } from "@/lib/useGps";

type Ride = {
  id: string;
  code: string;
  status: string;
  pickup: string;
  pickupLat: number;
  pickupLng: number;
  destination: string;
  destinationLat: number;
  destinationLng: number;
  vehicleType: string;
  distanceKm: number;
  durationMin: number;
  fare: number;
  route: [number, number][];
  driver: { name: string; phone?: string | null; vehicleModel?: string | null; vehicleNumber?: string | null; rating?: number | null } | null;
  driverLat: number | null;
  driverLng: number | null;
  driverSeenAt: string | null;
  dispatch: { notified: number; declined: number } | null;
  payment: {
    method: string | null;
    methodLabel: string;
    status: string;
    amount: number;
    reference: string | null;
    paidAt: string | null;
  };
  customerRating: number | null;
  customerFeedback: string | null;
  requestedAt: string;
  completedAt: string | null;
};

export default function RideDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CustomerShell title="Ride details" subtitle="Status, live location, payment and feedback stay together on this trip.">
      <RideDetail id={params.id} />
    </CustomerShell>
  );
}

function RideDetail({ id }: { id: string }) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [complaint, setComplaint] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  // Newest answer wins: a slow poll must not overwrite the result of an action taken after it started.
  const latest = useRef(0);

  async function load() {
    const n = ++latest.current;
    const response = await apiFetch(`/api/rides/${id}`);
    const data = await response.json().catch(() => ({}));
    if (n !== latest.current) return;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) setError(data.error ?? "We couldn't load this ride.");
      else setIssue(data.error ?? "We couldn't refresh this ride. Retrying…");
      return;
    }
    setRide(data.ride);
    setError(null);
    setIssue(null);
  }

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        if (active) await load();
      } catch {
        if (active) setIssue("Can't reach RideX — showing the last information received. Retrying automatically.");
      }
    };
    void run();
    const timer = window.setInterval(run, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The rider's own GPS is shared with the driver only while the trip is open. It stops the
  // moment the ride is completed or cancelled.
  const tripOpen = !!ride && !["COMPLETED", "CANCELLED"].includes(ride.status);
  const gps = useGpsShare({
    enabled: tripOpen,
    send: async (payload) => (await apiFetch(`/api/rides/${id}`, jsonInit("POST", payload))).ok,
  });
  const gpsLine = describeGps(gps);

  // The driver's marker exists only while a driver is assigned and the trip is open.
  const driverTracked = !!ride && ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_RIDE"].includes(ride.status);
  const driverFix =
    driverTracked && ride && ride.driverLat !== null && ride.driverLng !== null
      ? { lat: ride.driverLat, lng: ride.driverLng, seenAt: ride.driverSeenAt }
      : null;
  const legTarget =
    ride?.status === "DRIVER_ASSIGNED"
      ? { lat: ride.pickupLat, lng: ride.pickupLng }
      : ride?.status === "IN_RIDE"
        ? { lat: ride.destinationLat, lng: ride.destinationLng }
        : null;
  const { leg, failed: legFailed } = useLiveLeg(driverFix, legTarget);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!ride || busy) return;
    setBusy(action);
    setNotice(null);
    try {
      const response = await apiFetch(`/api/rides/${ride.id}/action`, jsonInit("POST", { action, ...extra }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(data.error ?? "That action did not go through.");
        return;
      }
      if (data.ride) {
        latest.current += 1;
        setRide(data.ride);
      }
      // A successful demo payment is already shown by the green payment card, so no second banner.
      const paidNow = action === "pay_demo" && data.ride?.payment?.status === "PAID";
      setNotice(paidNow ? null : (data.message ?? "Saved."));
    } catch {
      setNotice("Unable to reach RideX right now.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Panel><p role="alert">{error}</p><Link href="/rides" className="mt-4 inline-flex font-semibold text-brand">All my rides</Link></Panel>;
  if (!ride) return <Panel>{issue ?? "Loading your ride…"}</Panel>;

  const liveState = positionState(ride.driverSeenAt);
  const driverLive = driverFix ? { ...driverFix, label: ride.driver?.name ?? "Your driver" } : null;
  const toStop = ride.status === "IN_RIDE" ? "your destination" : "your pickup point";
  const cancellable = ["REQUESTED", "DRIVER_ASSIGNED", "DRIVER_ARRIVED"].includes(ride.status);
  const paid = paymentPresentation({ role: "customer", rideStatus: ride.status, status: ride.payment.status, method: ride.payment.method }).paid;
  const stage = rideStage({
    status: ride.status,
    notified: ride.dispatch?.notified,
    declined: ride.dispatch?.declined,
    driverName: ride.driver?.name,
    driverLive: !!driverFix && liveState === "live",
  });
  const driverState = !driverTracked ? "ended" : liveState === "live" ? "live" : liveState === "stale" ? "stale" : "waiting";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <RideStatusCard
          stage={stage}
          code={ride.code}
          meta={
            leg && !leg.arrived && legTarget ? (
              <span data-testid="status-eta" className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-3 py-1.5 text-[0.82rem] font-semibold text-brand-dark">
                <Icons.Navigation className="h-3.5 w-3.5" />
                {leg.distanceKm.toFixed(1)} km · about {leg.durationMin} min to {toStop}
              </span>
            ) : null
          }
        />
        {issue ? <p role="alert" data-testid="connection-banner" className="rounded-xl border border-brand/40 bg-white px-4 py-3 text-[0.88rem] font-semibold text-brand-dark">{issue}</p> : null}
        {notice ? <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-[0.9rem] font-semibold text-brand-dark">{notice}</p> : null}
        <RouteMap
          title={["COMPLETED", "CANCELLED"].includes(ride.status) ? "Trip map" : "Live tracking"}
          subtitle={
            ride.status === "CANCELLED"
              ? "Live tracking has stopped — this ride was cancelled."
              : ride.status === "COMPLETED"
                ? "Live tracking ended when the trip was completed."
                : undefined
          }
          pickup={{ lat: ride.pickupLat, lng: ride.pickupLng, label: ride.pickup }}
          destination={{ lat: ride.destinationLat, lng: ride.destinationLng, label: ride.destination }}
          driver={driverLive}
          route={ride.route}
          approach={leg?.geometry ?? null}
          ended={["COMPLETED", "CANCELLED"].includes(ride.status)}
          height="h-[380px]"
          emptyText="Waiting for a driver to share a GPS location."
        />
        {gpsLine ? (
          <p data-testid="gps-status" className={`text-[0.86rem] ${gpsLine.tone === "warn" ? "font-medium text-brand-dark" : "text-body"}`}>{gpsLine.text}</p>
        ) : null}

        {ride.status === "COMPLETED" ? (
          <PaymentCard
            role="customer"
            rideStatus={ride.status}
            payment={ride.payment}
            code={ride.code}
            actions={
              paid || ride.payment.status === "FAILED" ? undefined : (
                <>
                  <button type="button" disabled={!!busy} onClick={() => act("pay_demo")} className={`rx-btn h-12 px-6 ${ride.payment.method === "cash" ? "rx-btn-ghost" : "rx-btn-primary"}`}>
                    {busy === "pay_demo" ? "Confirming…" : "Pay now (demo checkout)"}
                  </button>
                  {ride.payment.status !== "PENDING" ? (
                    <button type="button" disabled={!!busy} onClick={() => act("pay_cash")} className={`rx-btn h-12 px-6 ${ride.payment.method === "cash" ? "rx-btn-primary" : "rx-btn-ghost"}`}>
                      {busy === "pay_cash" ? "Saving…" : "Pay cash to driver"}
                    </button>
                  ) : null}
                </>
              )
            }
          />
        ) : null}

        {ride.status === "COMPLETED" && !ride.customerRating ? (
          <Panel>
            <h3 className="font-display text-xl font-semibold text-ink">Rate this ride</h3>
            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)} className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${rating >= value ? "bg-brand text-white" : "bg-panel text-muted hover:bg-brand-soft"}`} aria-label={`${value} star`}>
                  <Icons.Star className="h-4 w-4" />
                </button>
              ))}
            </div>
            <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={1000} placeholder="How was the trip?" className="mt-4 min-h-24 w-full rounded-xl border border-[#e3e6ee] px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
            <button type="button" disabled={busy === "rate"} onClick={() => act("rate", { rating, feedback })} className="rx-btn rx-btn-primary mt-4 h-11 px-6">
              {busy === "rate" ? "Saving…" : "Submit feedback"}
            </button>
          </Panel>
        ) : null}
        {ride.customerRating ? (
          <Panel>
            <p className="flex items-center gap-2 font-semibold text-ink">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[0.82rem] text-brand-dark"><Icons.Star className="h-3.5 w-3.5" /> {ride.customerRating}/5</span>
              You rated this trip ★ {ride.customerRating}/5
            </p>
            {ride.customerFeedback ? <p className="mt-2 text-body">“{ride.customerFeedback}”</p> : null}
          </Panel>
        ) : null}
      </div>

      <aside className="min-w-0 space-y-4">
        <Panel>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Fare</p>
              <p data-testid="ride-fare" className="mt-1 font-display text-[2rem] font-extrabold leading-none text-ink">{formatMoney(ride.fare)}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5 text-[0.76rem] font-semibold text-ink-soft">
              <span className="rounded-full bg-panel px-2.5 py-1">{ride.distanceKm.toFixed(1)} km</span>
              <span className="rounded-full bg-panel px-2.5 py-1">{ride.durationMin} min</span>
              <span className="rounded-full bg-panel px-2.5 py-1">{ride.vehicleType.toUpperCase()}</span>
            </div>
          </div>
          <RouteTimeline className="mt-5" pickup={ride.pickup} destination={ride.destination} />
        </Panel>

        {ride.driver ? (
          <Panel data-testid="driver-card">
            <div className="flex items-center gap-3">
              <Avatar name={ride.driver.name} className="h-12 w-12 text-[1.05rem]" />
              <div className="min-w-0">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Your driver</p>
                <p data-testid="driver-name" className="truncate font-display text-xl font-semibold leading-tight text-ink">{ride.driver.name}</p>
              </div>
            </div>
            <p className="mt-3 text-[0.9rem] text-body">{ride.driver.vehicleModel} · {ride.driver.vehicleNumber}</p>
            {ride.driver.phone ? <p className="mt-1 text-[0.9rem] text-body">{ride.driver.phone}</p> : null}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.82rem] text-body">
              <span>{ride.driver.rating ? `★ ${ride.driver.rating}` : "New RideX driver"}</span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className={`h-2 w-2 rounded-full ${driverState === "live" ? "bg-green-500" : driverState === "stale" ? "bg-amber-500" : "bg-slate-300"}`} />
                {driverState === "ended" ? "Live tracking ended" : driverState === "live" ? "Live location" : driverState === "stale" ? "Last known location" : "Waiting for GPS"}
              </span>
            </p>
            {legTarget ? (
              <div data-testid="live-leg" className="mt-3 rounded-xl bg-panel px-3 py-2">
                {leg ? (
                  <p className="text-[0.9rem] font-semibold text-ink">
                    {leg.arrived ? `Your driver is at ${toStop}.` : `${leg.distanceKm.toFixed(1)} km away · about ${leg.durationMin} min to ${toStop}`}
                  </p>
                ) : (
                  <p className="text-[0.84rem] text-body">
                    {legFailed ? "Couldn't work out the driver's distance right now." : liveState === "stale" ? "The driver's location is out of date, so no ETA is shown." : "Waiting for the driver's live GPS to work out distance and ETA."}
                  </p>
                )}
                <p className="mt-0.5 text-[0.74rem] text-muted">Road route from the driver&apos;s last live GPS fix</p>
              </div>
            ) : null}
          </Panel>
        ) : ride.status === "CANCELLED" ? null : (
          <Panel>
            <p data-testid="waiting-driver" className="flex items-center gap-2 font-semibold text-ink"><Icons.Clock className="h-4 w-4 text-amber-500" /> No driver yet</p>
            <p className="mt-1 text-[0.9rem] text-body">Your request is open to approved drivers in this vehicle category.</p>
          </Panel>
        )}

        {ride.status !== "COMPLETED" ? (
          <Panel>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Payment</p>
            <div className="mt-2">
              <PaymentBadge testId="payment-status" role="customer" rideStatus={ride.status} payment={ride.payment} />
            </div>
            <p className="mt-2 text-[0.84rem] text-body">{methodLabel(ride.payment.method)} · {formatMoney(ride.payment.amount)}</p>
            <p className="mt-1 text-[0.8rem] text-muted">{paymentPresentation({ role: "customer", rideStatus: ride.status, status: ride.payment.status, method: ride.payment.method }).subtitle}</p>
          </Panel>
        ) : null}

        {cancellable ? (
          <button type="button" data-testid="cancel-request" disabled={!!busy} onClick={() => {
            const message = ride.status === "REQUESTED" ? "Cancel this request? Nearby drivers will no longer see it." : "Cancel this ride? Your driver will be notified.";
            if (window.confirm(message)) void act("cancel");
          }} className="rx-btn rx-btn-ghost h-12 w-full">
            {busy === "cancel" ? "Cancelling…" : "Cancel Request"}
          </button>
        ) : null}
        <Panel>
          <h3 className="font-semibold text-ink">Send a complaint</h3>
          <textarea value={complaint} onChange={(event) => setComplaint(event.target.value)} placeholder="Tell support what happened" className="mt-3 min-h-24 w-full rounded-xl border border-[#e3e6ee] px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
          <button type="button" disabled={busy === "complaint"} onClick={() => act("complaint", { description: complaint })} className="mt-3 text-[0.88rem] font-semibold text-brand">
            {busy === "complaint" ? "Sending…" : "Submit complaint"}
          </button>
        </Panel>
        <Link href="/rides" className="inline-flex font-semibold text-brand">All my rides</Link>
      </aside>
    </div>
  );
}
