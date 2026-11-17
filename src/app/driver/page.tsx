"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icons } from "@/components/brand";
import { PageFrame } from "@/components/chrome";
import { RouteMap } from "@/components/MapView";
import { PaymentBadge, PaymentCard, RideStatusPill, RouteTimeline } from "@/components/ride-ui";
import { apiFetch, jsonInit } from "@/lib/client";
import { formatMoney, methodLabel, paymentPresentation, positionState } from "@/lib/constants";
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
  distanceKm: number;
  durationMin: number;
  fare: number;
  vehicleType: string;
  route: [number, number][];
  customer: { name?: string; phone?: string } | null;
  customerLat: number | null;
  customerLng: number | null;
  customerSeenAt: string | null;
  driverLat: number | null;
  driverLng: number | null;
  driverSeenAt: string | null;
  payment: { driverMessage: string; method: string | null; methodLabel: string; status: string; amount: number; reference: string | null; paidAt: string | null; notice: string };
  customerRating: number | null;
  customerFeedback: string | null;
  requestedAt: string;
  completedAt: string | null;
};

type Dashboard = {
  verified: boolean;
  approvalStatus: string;
  accessGranted: boolean;
  online: boolean;
  canGoOnline: boolean;
  accessRevoked: boolean;
  statusMessage: string;
  vehicle: { type: string; model: string; number: string; name: string };
  currentRide: Ride | null;
  requests: Ride[];
  history: Ride[];
  stats: { completedTrips: number; earnings: number; paidAmount: number; averageRating: number | null; ratingCount: number };
};

const NEXT_ACTION: Record<string, { action: string; label: string }> = {
  DRIVER_ASSIGNED: { action: "status", label: "I've arrived" },
  DRIVER_ARRIVED: { action: "status", label: "Start ride" },
  IN_RIDE: { action: "status", label: "Complete ride" },
};

function Chip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-[0.76rem] font-semibold text-ink-soft">
      {icon}
      {children}
    </span>
  );
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-2xl font-semibold text-ink">{children}</h2>
      {hint ? <p className="text-[0.84rem] text-muted">{hint}</p> : null}
    </div>
  );
}

export default function DriverPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadIssue, setLoadIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggleMsg, setToggleMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  // Every dashboard request gets a number. Only the newest answer is applied, so a slow
  // poll that was already in flight cannot overwrite a status change made after it started.
  const latest = useRef(0);
  // What this device currently says about its GPS; sent with every refresh so the admin's live
  // view can say "location permission denied" instead of guessing.
  const gpsRef = useRef("off");

  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const response = await apiFetch(`/api/driver?gps=${gpsRef.current}`);
      const body = await response.json().catch(() => ({}));
      if (id !== latest.current) return;
      if (!response.ok) {
        setKind(response.status === 403 ? "role" : "auth");
        setError(body.error ?? "Unable to load your driver dashboard.");
        setLoadIssue(body.error ?? "Unable to refresh your dashboard.");
        return;
      }
      setError(null);
      setLoadIssue(null);
      setData(body);
    } catch {
      if (id === latest.current) {
        setError("Unable to reach RideX right now.");
        setLoadIssue("Can't reach RideX — showing the last information received. Retrying automatically.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const ids = (data?.requests ?? []).map((ride) => ride.id);
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seen.current?.has(id));
    seen.current = new Set(ids);
    if (fresh.length) {
      const timer = window.setTimeout(() => setNotice(`${fresh.length} new ride request${fresh.length > 1 ? "s" : ""} just arrived`), 0);
      return () => window.clearTimeout(timer);
    }
  }, [data?.requests]);

  // Real device GPS, only while the driver is online. One post per fix: the server stores it
  // on the driver's profile and, when a ride is open, on that ride (that is what the rider sees).
  const gps = useGpsShare({
    enabled: !!data?.online,
    send: async (payload) => (await apiFetch("/api/driver", jsonInit("POST", payload))).ok,
  });
  const gpsLine = describeGps(gps);
  useEffect(() => {
    gpsRef.current = gps.status;
  }, [gps.status]);
  const currentRide = data?.currentRide ?? null;
  // The moment a ride is assigned, send a fresh reading so the rider sees the driver at once.
  const assignedRideId = currentRide?.id ?? null;
  const refreshGps = gps.refreshNow;
  useEffect(() => {
    if (assignedRideId) refreshGps();
  }, [assignedRideId, refreshGps]);
  const selfFix = gps.fix ? { lat: gps.fix.lat, lng: gps.fix.lng, label: "You", seenAt: gps.fix.seenAt } : null;
  const toStop = currentRide?.status === "IN_RIDE" ? "destination" : "pickup";
  const legTarget =
    currentRide?.status === "DRIVER_ASSIGNED"
      ? { lat: currentRide.pickupLat, lng: currentRide.pickupLng }
      : currentRide?.status === "IN_RIDE"
        ? { lat: currentRide.destinationLat, lng: currentRide.destinationLng }
        : null;
  const { leg, failed: legFailed } = useLiveLeg(selfFix, legTarget);

  async function toggleOnline() {
    if (!data || toggling) return;
    setToggling(true);
    setToggleMsg(null);
    try {
      const response = await apiFetch("/api/driver", jsonInit("POST", { online: !data.online }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setToggleMsg({ ok: false, text: body.error ?? "Could not change your availability. Please try again." });
        void load(); // pick up anything that changed meanwhile (for example revoked access)
        return;
      }
      // Show the saved state immediately from the server's reply, then refresh in the background.
      setData((current) =>
        current
          ? {
              ...current,
              online: !!body.online,
              canGoOnline: body.canGoOnline ?? current.canGoOnline,
              verified: body.verified ?? current.verified,
              approvalStatus: body.approvalStatus ?? current.approvalStatus,
              accessGranted: body.accessGranted ?? current.accessGranted,
              statusMessage: body.statusMessage ?? current.statusMessage,
              requests: body.online ? current.requests : [],
              currentRide: body.releasedRide ? null : current.currentRide,
            }
          : current,
      );
      setToggleMsg({ ok: true, text: body.statusMessage ?? (body.online ? "You are online and can receive ride requests." : "You are offline. New ride requests will not reach you.") });
      void load();
    } catch {
      setToggleMsg({ ok: false, text: "Could not reach RideX. Check your connection and try again — your status was not changed." });
    } finally {
      setToggling(false);
    }
  }

  async function act(ride: Ride, action: string) {
    if (action === "cancel" && !window.confirm("Cancel this ride? It will be offered to other drivers.")) return;
    setBusy(ride.id + action);
    setNotice(null);
    try {
      const response = await apiFetch(`/api/rides/${ride.id}/action`, jsonInit("POST", { action }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setNotice(body.error ?? "That action did not go through.");
      else setNotice(body.message ?? "Saved.");
      await load();
    } catch {
      setNotice("Unable to reach RideX right now.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <PageFrame kicker="Driver dashboard" title={<>Ride <span className="text-brand">requests</span></>} intro="Every new request shows the customer, pickup, destination, distance and fare. Accept the ones you want — the customer is notified the moment you do." wide>
        <div className="rounded-2xl border border-hairline bg-white p-10 text-center text-body">Loading requests…</div>
      </PageFrame>
    );
  }
  if (error && !data) {
    return (
      <PageFrame kicker="Driver dashboard" title="Ride requests" wide>
        <div className="rounded-2xl border border-hairline bg-white p-10 text-center">
          <p className="font-display text-xl font-semibold text-ink">{error}</p>
          <Link href={kind === "role" ? "/rides" : "/login"} className="rx-btn rx-btn-primary mt-6 h-12 px-7">
            {kind === "role" ? "Go to my rides" : "Log In"} <Icons.ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </PageFrame>
    );
  }
  if (!data) return null;

  const focus = data.currentRide ?? data.requests[0] ?? null;
  const next = data.currentRide ? NEXT_ACTION[data.currentRide.status] : undefined;
  const customerPoint = data.currentRide?.customerLat != null && data.currentRide.customerLng != null
    ? { lat: data.currentRide.customerLat, lng: data.currentRide.customerLng, label: "Customer", seenAt: data.currentRide.customerSeenAt }
    : null;
  const storedSelf = data.currentRide?.driverLat != null && data.currentRide.driverLng != null
    ? { lat: data.currentRide.driverLat, lng: data.currentRide.driverLng, label: "You", seenAt: data.currentRide.driverSeenAt }
    : null;

  // Payments come straight from each ride's backend payment record. Green only when PAID.
  const isPaid = (ride: Ride) => paymentPresentation({ role: "driver", rideStatus: ride.status, status: ride.payment.status, method: ride.payment.method }).paid;
  const received = data.history.find((ride) => ride.status === "COMPLETED" && isPaid(ride)) ?? null;
  const awaiting = data.history.filter((ride) => ride.status === "COMPLETED" && !isPaid(ride) && ride.payment.status !== "FAILED").slice(0, 3);
  const heading = data.approvalStatus === "rejected" ? "Application not approved" : data.accessRevoked ? "Online access revoked" : data.verified ? (data.online ? "You are online" : "You are offline") : "Awaiting verification";
  const cashPending = (ride: Ride) => ride.status === "COMPLETED" && ride.payment.method === "cash" && ride.payment.status !== "PAID";

  return (
    <PageFrame kicker="Driver dashboard" title={<>Ride <span className="text-brand">requests</span></>} intro="Every new request shows the customer, pickup, destination, distance and fare. Accept the ones you want — the customer is notified the moment you do." wide>
      <div className="space-y-8">
        {loadIssue ? <p role="alert" data-testid="connection-banner" className="rounded-xl border border-brand/40 bg-white px-4 py-3 text-[0.88rem] font-semibold text-brand-dark">{loadIssue}</p> : null}
        {notice ? <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-[0.9rem] font-semibold text-brand-dark">{notice}</p> : null}

        <section className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_24px_50px_-42px_rgba(22,35,63,0.55)] sm:p-6">
          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${data.verified ? "bg-brand-soft text-brand" : "bg-panel text-muted"}`}>
              <Icons.Car className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1 basis-60">
              <p data-testid="driver-heading" className="flex flex-wrap items-center gap-2.5 font-display text-[1.15rem] font-semibold leading-tight text-ink">
                {heading}
                {data.verified ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold leading-none ${data.online ? "border-green-200 bg-green-50 text-green-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${data.online ? "bg-green-500" : "bg-slate-400"}`} />
                    {data.online ? "Online" : "Offline"}
                  </span>
                ) : null}
              </p>
              <p id="driver-status-message" data-testid="driver-status-message" className="mt-1 text-[0.9rem] text-body">{data.statusMessage}</p>
              <p className="mt-1.5 text-[0.82rem] text-muted">{data.vehicle.name} · {data.vehicle.model} · {data.vehicle.number}</p>
              {toggleMsg ? (
                <p role={toggleMsg.ok ? "status" : "alert"} data-testid="toggle-message" className={`mt-3 rounded-lg px-3 py-2 text-[0.86rem] font-semibold text-brand-dark ${toggleMsg.ok ? "bg-brand-soft" : "border border-brand/40 bg-white"}`}>
                  {toggleMsg.text}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              data-testid="driver-toggle"
              disabled={toggling}
              aria-describedby="driver-status-message"
              onClick={toggleOnline}
              className={`rx-btn h-12 w-full min-w-[10rem] px-6 sm:w-auto ${data.canGoOnline && !data.online ? "rx-btn-primary" : "rx-btn-ghost"}`}
            >
              {toggling ? "Saving…" : data.online ? "Go Offline" : "Go Online"}
            </button>
          </div>
          {gpsLine ? (
            <p data-testid="gps-status" className={`mt-4 flex items-start gap-2 border-t border-hairline pt-4 text-[0.86rem] ${gpsLine.tone === "warn" ? "font-medium text-brand-dark" : "text-body"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${gpsLine.tone === "warn" ? "bg-amber-500" : "bg-green-500"}`} />
              {gpsLine.text}
            </p>
          ) : null}
        </section>

        {received || awaiting.length ? (
          <section data-testid="driver-payments" aria-label="Payments">
            <div className="grid gap-4 md:grid-cols-2">
              {received ? (
                <div data-testid="payment-received-card">
                  <p className="mb-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-muted">Latest payment · Ride {received.code}</p>
                  <PaymentCard role="driver" rideStatus={received.status} payment={received.payment} compact />
                </div>
              ) : null}
              {awaiting.map((ride) => (
                <div key={ride.id} data-testid="payment-pending-card">
                  <p className="mb-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-muted">Awaiting payment · Ride {ride.code}</p>
                  <PaymentCard
                    role="driver"
                    rideStatus={ride.status}
                    payment={ride.payment}
                    compact
                    actions={
                      cashPending(ride) ? (
                        <button type="button" disabled={!!busy} onClick={() => act(ride, "confirm_cash")} className="rx-btn rx-btn-primary h-11 px-5 text-[0.92rem]">
                          Confirm cash received
                        </button>
                      ) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <RouteMap
            title={focus ? "Ride map" : "Live map"}
            subtitle={data.online ? "Your position is shared only while you are online" : "Go online to share your location"}
            pickup={focus ? { lat: focus.pickupLat, lng: focus.pickupLng, label: focus.pickup } : null}
            destination={focus ? { lat: focus.destinationLat, lng: focus.destinationLng, label: focus.destination } : null}
            route={focus?.route ?? null}
            approach={leg?.geometry ?? null}
            driver={selfFix ?? storedSelf}
            customer={customerPoint}
            height="h-[360px]"
            emptyText="Go online and allow location access: your own position appears here, and open requests show their route."
          />
          <div className="min-w-0 space-y-4">
            <article className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_24px_50px_-42px_rgba(22,35,63,0.55)]">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Earnings</p>
              <p className="mt-1 font-display text-[2rem] font-extrabold leading-none text-ink">{formatMoney(data.stats.earnings)}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-panel px-2 py-2.5">
                  <p className="font-display text-lg font-bold text-ink">{data.stats.completedTrips}</p>
                  <p className="text-[0.7rem] text-muted">Trips</p>
                </div>
                <div className="rounded-xl bg-panel px-2 py-2.5">
                  <p className="font-display text-lg font-bold text-ink">{formatMoney(data.stats.paidAmount)}</p>
                  <p className="text-[0.7rem] text-muted">Received</p>
                </div>
                <div className="rounded-xl bg-panel px-2 py-2.5">
                  <p className="font-display text-lg font-bold text-ink">{data.stats.averageRating !== null ? `★ ${data.stats.averageRating.toFixed(1)}` : "—"}</p>
                  <p className="text-[0.7rem] text-muted">{data.stats.averageRating !== null ? `${data.stats.ratingCount} rating${data.stats.ratingCount === 1 ? "" : "s"}` : "No ratings yet"}</p>
                </div>
              </div>
            </article>

            {data.currentRide ? (
              <article className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_24px_50px_-42px_rgba(22,35,63,0.55)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{data.currentRide.code}</p>
                  <RideStatusPill testId="driver-ride-status" status={data.currentRide.status} />
                </div>
                <p className="mt-3 text-[0.95rem] font-semibold text-ink">{data.currentRide.customer?.name}{data.currentRide.customer?.phone ? <span className="font-normal text-body"> • {data.currentRide.customer.phone}</span> : null}</p>
                <RouteTimeline className="mt-3" pickup={data.currentRide.pickup} destination={data.currentRide.destination} />
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Chip>{data.currentRide.distanceKm.toFixed(1)} km · {data.currentRide.durationMin} min trip</Chip>
                  <Chip>{formatMoney(data.currentRide.fare)}</Chip>
                  <Chip icon={data.currentRide.payment.method === "cash" ? <Icons.Banknote className="h-3.5 w-3.5" /> : undefined}>Rider pays by: {data.currentRide.payment.methodLabel}</Chip>
                </div>
                <p className="mt-3 text-[0.84rem] text-body">Customer location: {positionState(data.currentRide.customerSeenAt) === "live" ? "live" : data.currentRide.customerLat ? "last known" : "not shared"}</p>
                {legTarget ? (
                  <div data-testid="live-leg" className="mt-3 rounded-xl bg-panel px-3 py-2">
                    {leg ? (
                      <p className="text-[0.9rem] font-semibold text-ink">
                        {leg.arrived ? `You are at the ${toStop}.` : `${leg.distanceKm.toFixed(1)} km · about ${leg.durationMin} min to the ${toStop}`}
                      </p>
                    ) : (
                      <p className="text-[0.84rem] text-body">
                        {legFailed ? `Couldn't work out the route to the ${toStop} right now.` : "Waiting for a fresh GPS fix to work out distance and ETA."}
                      </p>
                    )}
                    <p className="mt-0.5 text-[0.74rem] text-muted">Road route from your last live GPS fix</p>
                  </div>
                ) : null}
                {next ? (
                  <button type="button" disabled={busy === data.currentRide.id + "status"} onClick={() => act(data.currentRide!, "status")} className="rx-btn rx-btn-primary mt-4 h-11 w-full">
                    {busy === data.currentRide.id + "status" ? "Saving…" : next.label}
                  </button>
                ) : null}
                {["DRIVER_ASSIGNED", "DRIVER_ARRIVED"].includes(data.currentRide.status) ? (
                  <button type="button" disabled={!!busy} onClick={() => act(data.currentRide!, "cancel")} className="rx-btn rx-btn-ghost mt-2 h-11 w-full">
                    Cancel ride
                  </button>
                ) : null}
              </article>
            ) : (
              <article className="rounded-2xl border border-dashed border-[#d9dde8] bg-white/70 p-5 text-[0.92rem] text-body">
                {data.online ? "New requests from customers pop up here automatically, with a notification." : "Go online to start receiving ride requests."}
              </article>
            )}
          </div>
        </div>

        <section>
          <SectionTitle hint={data.requests.length ? `${data.requests.length} open` : undefined}>Incoming requests</SectionTitle>
          {data.requests.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#d9dde8] bg-white/70 px-5 py-6 text-[0.92rem] text-body">{data.verified && data.online ? "No open requests for your vehicle right now." : "Ride requests start reaching you as soon as verification is complete and you are online."}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.requests.map((ride) => (
                <article key={ride.id} className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_24px_50px_-42px_rgba(22,35,63,0.55)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">{ride.code}</p>
                      <p className="mt-0.5 truncate font-semibold text-ink">{ride.customer?.name ?? "Customer"}{ride.customer?.phone ? ` · ${ride.customer.phone}` : ""}</p>
                    </div>
                    <p className="shrink-0 font-display text-[1.6rem] font-extrabold leading-none text-ink">{formatMoney(ride.fare)}</p>
                  </div>
                  <RouteTimeline className="mt-4" pickup={ride.pickup} destination={ride.destination} />
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <Chip>{ride.distanceKm.toFixed(1)} km · {ride.durationMin} min</Chip>
                    <Chip icon={ride.payment.method === "cash" ? <Icons.Banknote className="h-3.5 w-3.5" /> : undefined}>Pays by {ride.payment.methodLabel}</Chip>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" disabled={!!busy} onClick={() => act(ride, "accept")} className="rx-btn rx-btn-primary h-11 px-5">Accept</button>
                    <button type="button" disabled={!!busy} onClick={() => act(ride, "reject")} className="rx-btn rx-btn-ghost h-11 px-5">Reject</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle hint={data.history.length ? `Last ${data.history.length} trip${data.history.length === 1 ? "" : "s"}` : undefined}>Ride history</SectionTitle>
          {data.history.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#d9dde8] bg-white/70 px-5 py-6 text-[0.92rem] text-body">Completed and past trips will appear here.</p>
          ) : (
            <ul className="grid gap-3">
              {data.history.map((ride) => (
                <li key={ride.id} data-testid="history-row" data-ride={ride.code} className="rounded-2xl border border-hairline bg-white p-4 shadow-[0_18px_40px_-36px_rgba(22,35,63,0.5)] sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
                        <span className="font-semibold text-ink">{ride.code}</span>
                        <span>{new Date(ride.completedAt ?? ride.requestedAt).toLocaleString()}</span>
                      </p>
                      <p className="mt-1 line-clamp-2 text-[0.9rem] leading-snug text-body" title={`${ride.pickup} → ${ride.destination}`}>{ride.pickup} → {ride.destination}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <RideStatusPill status={ride.status} />
                      <p className="font-display text-xl font-extrabold text-ink">{formatMoney(ride.fare)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                    <PaymentBadge testId="history-payment" role="driver" rideStatus={ride.status} payment={ride.payment} />
                    <Chip>{methodLabel(ride.payment.method)}</Chip>
                    {ride.customerRating ? <Chip icon={<Icons.Star className="h-3.5 w-3.5 text-brand" />}>{ride.customerRating}/5</Chip> : null}
                    {cashPending(ride) ? (
                      <button type="button" disabled={!!busy} className="ml-auto rounded-full border border-brand px-3.5 py-1.5 text-[0.8rem] font-semibold text-brand-dark transition-colors hover:bg-brand-soft" onClick={() => act(ride, "confirm_cash")}>Confirm cash</button>
                    ) : null}
                  </div>
                  {ride.customerFeedback ? <p className="mt-2 text-[0.84rem] italic text-body">“{ride.customerFeedback}”</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
