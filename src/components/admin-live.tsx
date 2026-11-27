"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fieldClass } from "@/components/chrome";
import { RouteMap, type LivePoint } from "@/components/MapView";
import { RideStatusPill } from "@/components/ride-ui";
import { apiFetch } from "@/lib/client";
import { STATUS_LABEL, formatMoney, positionState } from "@/lib/constants";

type LiveDriver = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  accountStatus: string;
  vehicleType: string;
  vehicleModel: string;
  vehicleNumber: string;
  approvalStatus: string;
  accessGranted: boolean;
  decisionNote: string | null;
  online: boolean;
  eligible: boolean;
  dispatch: string;
  lastSeenAt: string | null;
  gpsState: string | null;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
  activeRide: { id: string; code: string; status: string } | null;
};

type LiveRide = {
  id: string;
  code: string;
  status: string;
  vehicleType: string;
  pickup: string;
  pickupLat: number;
  pickupLng: number;
  destination: string;
  destinationLat: number;
  destinationLng: number;
  route: [number, number][];
  fare: number;
  distanceKm: number;
  durationMin: number;
  requestedAt: string;
  assignedAt: string | null;
  paymentMethod: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  driver: { id: string; name: string; phone: string | null; vehicleModel: string; vehicleNumber: string } | null;
  driverLat: number | null;
  driverLng: number | null;
  driverSeenAt: string | null;
  offered: number;
  declined: number;
};

type LiveData = {
  serverTime: string;
  presenceSeconds: number;
  staleSeconds: number;
  stats: { drivers: number; online: number; eligible: number; onTrip: number; activeRides: number; waitingRides: number };
  drivers: LiveDriver[];
  activeRides: LiveRide[];
  waitingRides: LiveRide[];
};

type Selection = { kind: "ride" | "driver"; id: string; code: string } | null;
type Tone = "green" | "amber" | "red" | "grey" | "blue";

const POLL_MS = 10000;

const TONE: Record<Tone, string> = {
  green: "border-green-200 bg-green-50 text-green-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  grey: "border-slate-200 bg-slate-50 text-slate-600",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
};
const DOT: Record<Tone, string> = { green: "bg-green-500", amber: "bg-amber-500", red: "bg-red-500", grey: "bg-slate-400", blue: "bg-blue-500" };
const pill = (tone: Tone) => `inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.72rem] font-semibold leading-tight ${TONE[tone]}`;

function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "a few seconds";
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}
const ago = (ms: number) => (ms < 5000 ? "just now" : `${duration(ms)} ago`);

function approvalOf(d: LiveDriver): { label: string; tone: Tone; key: string } {
  if (d.accountStatus !== "active") return { label: "Account suspended", tone: "red", key: "suspended" };
  if (d.approvalStatus === "rejected") return { label: "Rejected", tone: "red", key: "rejected" };
  if (d.approvalStatus !== "approved") return { label: "Pending approval", tone: "amber", key: "pending" };
  if (!d.accessGranted) return { label: "Access revoked", tone: "red", key: "revoked" };
  return { label: "Approved", tone: "green", key: "approved" };
}

const DISPATCH: Record<string, { label: string; tone: Tone }> = {
  eligible: { label: "Eligible for requests", tone: "green" },
  on_trip: { label: "On a trip — not taking new requests", tone: "blue" },
  offline: { label: "Not taking requests (offline)", tone: "grey" },
  unreachable: { label: "Online, but not reachable", tone: "amber" },
  revoked: { label: "Cannot accept rides — access revoked", tone: "red" },
  pending: { label: "Cannot accept rides — awaiting approval", tone: "amber" },
  rejected: { label: "Cannot accept rides — rejected", tone: "red" },
  suspended: { label: "Cannot accept rides — account suspended", tone: "red" },
};

const GPS_REPORT: Record<string, string> = {
  denied: "Location permission is denied on the driver's device, so there is no position to show.",
  unavailable: "The driver's device cannot provide a GPS location right now.",
  waiting: "Waiting for the driver's first GPS fix.",
  sharing: "The driver's device says it is sharing GPS, but no position has arrived yet.",
  off: "The driver's device is not sharing GPS.",
};

export function LiveTracking() {
  const [data, setData] = useState<LiveData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [skew, setSkew] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  // "auto" = follow the newest active ride (or the overview when there is none) until the admin chooses.
  const [sel, setSel] = useState<Selection | "auto">("auto");
  const [filter, setFilter] = useState<"all" | "online" | "eligible" | "offline" | "unapproved">("all");
  const [query, setQuery] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    const n = ++latest.current;
    try {
      const response = await apiFetch("/api/admin?view=live");
      const body = await response.json().catch(() => ({}));
      if (n !== latest.current) return; // a newer request already answered
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setFatal("Admin access required. Sign in with a RideX admin account.");
          return;
        }
        setIssue(body.error ?? "Live data could not be refreshed. Retrying automatically.");
        return;
      }
      const received = Date.now();
      setSkew(Date.parse(body.serverTime) - received);
      setData(body as LiveData);
      setIssue(null);
      setFatal(null);
      setLastOk(received);
    } catch {
      if (n === latest.current) setIssue("Can't reach RideX — showing the last information received. Retrying automatically.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const serverNow = tick + skew;
  const staleMs = (data?.staleSeconds ?? 90) * 1000;
  const presenceMs = (data?.presenceSeconds ?? 120) * 1000;
  // Timestamps are shifted onto this computer's clock so the map's live/stale judgement matches the server's.
  const adjust = useCallback((iso: string | null) => (iso ? new Date(Date.parse(iso) - skew).toISOString() : null), [skew]);

  const drivers = useMemo(() => data?.drivers ?? [], [data]);
  const activeRides = useMemo(() => data?.activeRides ?? [], [data]);
  const waitingRides = useMemo(() => data?.waitingRides ?? [], [data]);

  // Resolve what is selected from the latest data. A ride that disappears from the open lists has
  // been completed or cancelled: tracking ends, and the page says so instead of silently switching.
  const effective: Selection = sel === "auto" ? (activeRides[0] ? { kind: "ride", id: activeRides[0].id, code: activeRides[0].code } : null) : sel;
  const ride = effective?.kind === "ride" ? [...activeRides, ...waitingRides].find((item) => item.id === effective.id) ?? null : null;
  const rideGone = !!effective && effective.kind === "ride" && !ride && !!data;
  const selDriver = effective?.kind === "driver" ? drivers.find((item) => item.id === effective.id) ?? null : null;
  const rideDriver = ride?.driver ? drivers.find((item) => item.id === ride.driver!.id) ?? null : null;
  const focusDriverId = rideDriver?.id ?? selDriver?.id ?? null;

  const point = (d: LiveDriver): LivePoint | null =>
    d.lat != null && d.lng != null
      ? { lat: d.lat, lng: d.lng, label: `${d.name} · ${d.vehicleModel} (${d.vehicleNumber})${d.activeRide ? ` · on ${d.activeRide.code}` : ""}`, seenAt: adjust(d.locationUpdatedAt) }
      : null;

  // Every ONLINE driver that has a stored GPS position. Nothing is drawn for drivers without one.
  const fleet: LivePoint[] = drivers
    .filter((d) => d.online && d.id !== focusDriverId)
    .map(point)
    .filter((p): p is LivePoint => !!p);
  const onlineWithGps = drivers.filter((d) => d.online && d.lat != null && d.lng != null).length;

  const rideDriverPoint: LivePoint | null = ride && ride.driverLat != null && ride.driverLng != null
    ? { lat: ride.driverLat, lng: ride.driverLng, label: ride.driver?.name ?? "Driver", seenAt: adjust(ride.driverSeenAt) }
    : null;
  const selDriverPoint = selDriver && selDriver.online ? point(selDriver) : null;

  const locationOf = (d: LiveDriver) => {
    const hasPos = d.lat != null && d.lng != null && !!d.locationUpdatedAt;
    const age = d.locationUpdatedAt ? serverNow - Date.parse(d.locationUpdatedAt) : null;
    const report = d.gpsState ? GPS_REPORT[d.gpsState] : null;
    if (hasPos && age != null) {
      if (age < staleMs) return { state: "live" as const, tone: "green" as Tone, text: `GPS live · updated ${ago(age)}` };
      return {
        state: "stale" as const,
        tone: "amber" as Tone,
        text: `Last known location from ${ago(age)} — not live${d.gpsState === "denied" ? " (permission is now denied on the device)" : ""}`,
      };
    }
    return { state: "none" as const, tone: "amber" as Tone, text: report ?? "No GPS location shared yet." };
  };

  const lastSeenOf = (d: LiveDriver) => {
    if (!d.lastSeenAt) return d.online ? "No contact recorded yet" : "Last seen: not recorded yet";
    const age = serverNow - Date.parse(d.lastSeenAt);
    if (d.online && age > presenceMs) return `No contact for ${duration(age)} — the driver app may be closed or offline`;
    return `${d.online ? "Active" : "Last seen"} ${ago(age)}`;
  };

  const counts = {
    all: drivers.length,
    online: drivers.filter((d) => d.online).length,
    eligible: drivers.filter((d) => d.eligible).length,
    offline: drivers.filter((d) => !d.online).length,
    unapproved: drivers.filter((d) => approvalOf(d).key !== "approved").length,
  };
  const roster = drivers.filter((d) => {
    if (filter === "online" && !d.online) return false;
    if (filter === "eligible" && !d.eligible) return false;
    if (filter === "offline" && d.online) return false;
    if (filter === "unapproved" && approvalOf(d).key === "approved") return false;
    const q = query.trim().toLowerCase();
    return !q || `${d.name} ${d.email} ${d.vehicleNumber} ${d.vehicleModel}`.toLowerCase().includes(q);
  });

  const pickDriver = (d: LiveDriver) => setSel(d.activeRide ? { kind: "ride", id: d.activeRide.id, code: d.activeRide.code } : { kind: "driver", id: d.id, code: d.name });

  if (fatal) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-8">
        <p className="font-display text-xl font-semibold text-ink">{fatal}</p>
        <Link href="/admin/login" className="rx-btn rx-btn-primary mt-5 h-11 px-6">Admin Login</Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        {issue ? <p role="alert" data-testid="live-connection-banner" className="rounded-xl border border-brand/40 bg-white px-4 py-3 text-[0.88rem] font-semibold text-brand-dark">{issue}</p> : null}
        <p className="rounded-2xl border border-hairline bg-white p-8 text-body">Loading live tracking…</p>
      </div>
    );
  }

  const token = effective ? `${effective.kind}:${effective.id}` : "overview";
  const mapTitle = ride ? `${ride.code} · ${STATUS_LABEL[ride.status as keyof typeof STATUS_LABEL] ?? ride.status}` : selDriver ? selDriver.name : "Online drivers";
  const mapSubtitle = ride
    ? `${ride.customer?.name ?? "Customer"} · ${ride.driver?.name ?? "No driver yet"}`
    : selDriver
      ? `${selDriver.vehicleModel} · ${selDriver.vehicleNumber}`
      : `${counts.online} online · ${onlineWithGps} with a GPS position`;
  const summary: [string, number, string][] = [
    ["Drivers", data.stats.drivers, "slate"],
    ["Online", data.stats.online, "green"],
    ["Eligible for requests", data.stats.eligible, "green"],
    ["On a trip", data.stats.onTrip, "blue"],
    ["Active rides", data.stats.activeRides, "orange"],
    ["Waiting for a driver", data.stats.waitingRides, "amber"],
  ];

  return (
    <div className="space-y-4">
      <section aria-label="Live summary" data-testid="live-summary" className="flex flex-wrap items-center gap-2">
        {summary.map(([label, value]) => (
          <span key={label} data-stat={label} className="rounded-xl border border-hairline bg-white px-3 py-2 text-[0.82rem] text-body">
            <span className="font-display text-[1.05rem] font-bold text-ink">{value}</span> {label}
          </span>
        ))}
        <span data-testid="live-updated" className="ml-auto inline-flex items-center gap-2 text-[0.78rem] text-muted">
          <span className={`h-2 w-2 rounded-full ${issue ? "bg-amber-500" : "animate-pulse bg-green-500"}`} />
          {lastOk ? `Updated ${new Date(lastOk).toLocaleTimeString()}` : "Waiting for data"} · refreshes every {POLL_MS / 1000} s
        </span>
      </section>

      {issue ? (
        <p role="alert" data-testid="live-connection-banner" className="rounded-xl border border-brand/40 bg-white px-4 py-3 text-[0.88rem] font-semibold text-brand-dark">
          {issue}{lastOk ? ` Last successful update: ${new Date(lastOk).toLocaleTimeString()}.` : ""} Positions below may be out of date.
        </p>
      ) : null}
      {rideGone ? (
        <p role="status" data-testid="live-ride-gone" className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-semibold text-brand-dark">
          <span>
            {effective?.code} is no longer being tracked — it was completed or cancelled. Its record is kept in{" "}
            <Link href="/admin/rides" className="underline">Ride Management</Link>.
          </span>
          <button type="button" onClick={() => setSel(null)} className="rounded-full border border-brand px-3 py-1 text-[0.78rem]">Show all drivers</button>
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className="order-2 min-w-0 space-y-4 xl:order-1">
          <section className="rounded-2xl border border-hairline bg-white p-4" aria-label="Drivers">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-ink">Drivers</h2>
              <span className="text-[0.78rem] text-muted">{roster.length} shown</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {([["all", "All"], ["online", "Online"], ["eligible", "Eligible"], ["offline", "Offline"], ["unapproved", "Not approved"]] as const).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filter === key} data-filter={key} onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${filter === key ? "border-brand bg-brand text-white" : "border-hairline bg-white text-ink-soft hover:border-brand/50"}`}>
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, e-mail, vehicle or plate" className={`${fieldClass} mt-3 !py-2 text-[0.9rem]`} aria-label="Search drivers" />
            <ul data-testid="driver-roster" className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {roster.length === 0 ? <li className="rounded-xl bg-panel px-3 py-4 text-[0.88rem] text-body">{drivers.length === 0 ? "No drivers have registered yet." : "No drivers match this filter."}</li> : null}
              {roster.map((d) => {
                const approval = approvalOf(d);
                const dispatch = DISPATCH[d.dispatch] ?? { label: d.dispatch, tone: "grey" as Tone };
                const loc = locationOf(d);
                const selected = (effective?.kind === "driver" && effective.id === d.id) || (!!d.activeRide && effective?.kind === "ride" && effective.id === d.activeRide.id);
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      data-testid="driver-row"
                      data-driver={d.id}
                      data-name={d.name}
                      data-online={String(d.online)}
                      data-eligible={String(d.eligible)}
                      data-approval={approval.key}
                      data-dispatch={d.dispatch}
                      data-location={d.online ? loc.state : "n/a"}
                      onClick={() => pickDriver(d)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors hover:border-brand/50 ${selected ? "border-brand bg-brand-soft/40" : "border-hairline bg-white"}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">{d.name}</span>
                          <span className="block truncate text-[0.78rem] text-muted">{d.vehicleModel} · {d.vehicleType.toUpperCase()} · {d.vehicleNumber}</span>
                        </span>
                        <span data-testid="driver-online-badge" className={pill(d.online ? "green" : "grey")}>
                          <span className={`h-1.5 w-1.5 rounded-full ${d.online ? DOT.green : DOT.grey}`} />
                          {d.online ? "Online" : "Offline"}
                        </span>
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        <span data-testid="driver-approval-badge" className={pill(approval.tone)}>{approval.label}</span>
                        <span data-testid="driver-dispatch-badge" className={pill(dispatch.tone)}>{dispatch.label}</span>
                      </span>
                      <span data-testid="driver-lastseen" className="mt-2 block text-[0.78rem] text-body">{lastSeenOf(d)}</span>
                      {d.online ? (
                        <span data-testid="driver-location" className={`mt-1 flex items-start gap-1.5 text-[0.78rem] ${loc.state === "live" ? "text-body" : "font-medium text-brand-dark"}`}>
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[loc.tone]}`} />
                          {loc.text}
                        </span>
                      ) : null}
                      {d.activeRide ? <span className="mt-1.5 block text-[0.78rem] font-semibold text-ink">On {d.activeRide.code} · {STATUS_LABEL[d.activeRide.status as keyof typeof STATUS_LABEL] ?? d.activeRide.status}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-hairline bg-white p-4" aria-label="Active rides">
            <h2 className="font-display text-lg font-semibold text-ink">Active rides <span className="text-[0.85rem] font-normal text-muted">({activeRides.length})</span></h2>
            {activeRides.length === 0 ? <p data-testid="no-active-rides" className="mt-3 rounded-xl bg-panel px-3 py-4 text-[0.88rem] text-body">No rides are active right now. A ride appears here once a driver accepts it and leaves when it is completed or cancelled.</p> : null}
            <ul className="mt-3 space-y-2">
              {activeRides.map((item) => (
                <li key={item.id}>
                  <button type="button" data-testid="active-ride" data-ride={item.code} data-status={item.status} onClick={() => setSel({ kind: "ride", id: item.id, code: item.code })} className={`w-full rounded-xl border p-3 text-left hover:border-brand/50 ${effective?.kind === "ride" && effective.id === item.id ? "border-brand bg-brand-soft/40" : "border-hairline bg-white"}`}>
                    <span className="flex items-center justify-between gap-2"><span className="font-semibold text-ink">{item.code}</span><RideStatusPill testId="active-ride-status" status={item.status} /></span>
                    <span className="mt-1 block text-[0.82rem] text-body">{item.customer?.name ?? "Customer"} · driver {item.driver?.name ?? "—"}</span>
                    <span className="mt-1 block truncate text-[0.78rem] text-muted">{item.pickup} → {item.destination}</span>
                  </button>
                </li>
              ))}
            </ul>
            <h3 className="mt-5 text-[0.95rem] font-semibold text-ink">Waiting for a driver <span className="text-[0.82rem] font-normal text-muted">({waitingRides.length})</span></h3>
            {waitingRides.length === 0 ? <p className="mt-2 text-[0.84rem] text-body">No open requests are waiting.</p> : null}
            <ul className="mt-2 space-y-2">
              {waitingRides.map((item) => (
                <li key={item.id}>
                  <button type="button" data-testid="waiting-ride" data-ride={item.code} onClick={() => setSel({ kind: "ride", id: item.id, code: item.code })} className={`w-full rounded-xl border p-3 text-left hover:border-brand/50 ${effective?.kind === "ride" && effective.id === item.id ? "border-brand bg-brand-soft/40" : "border-hairline bg-white"}`}>
                    <span className="flex items-center justify-between gap-2"><span className="font-semibold text-ink">{item.code}</span><RideStatusPill status={item.status} /></span>
                    <span className="mt-1 block text-[0.82rem] text-body">{item.customer?.name ?? "Customer"} · {item.vehicleType.toUpperCase()} · requested {ago(serverNow - Date.parse(item.requestedAt))}</span>
                    <span className="mt-1 block text-[0.78rem] text-muted">Sent to {item.offered} driver{item.offered === 1 ? "" : "s"} · {item.declined} declined</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="order-1 min-w-0 xl:order-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.84rem] text-body">
              {ride ? "Showing one ride: pickup, destination, route and the driver's current position." : selDriver ? "Showing one driver." : "Showing every online driver that has shared a GPS position."}
            </p>
            {effective ? <button type="button" data-testid="show-all-drivers" onClick={() => setSel(null)} className="rounded-full border border-hairline bg-white px-3 py-1.5 text-[0.8rem] font-semibold text-ink-soft hover:border-brand hover:text-brand-dark">All online drivers</button> : null}
          </div>
          <RouteMap
            title={mapTitle}
            subtitle={mapSubtitle}
            pickup={ride ? { lat: ride.pickupLat, lng: ride.pickupLng, label: `Pickup — ${ride.pickup}` } : null}
            destination={ride ? { lat: ride.destinationLat, lng: ride.destinationLng, label: `Destination — ${ride.destination}` } : null}
            driver={rideDriverPoint ?? selDriverPoint}
            drivers={fleet}
            route={ride?.route ?? null}
            follow={false}
            fitToken={token}
            fleetInFit={!ride && !selDriver}
            height="h-[460px]"
            emptyText="No online driver has shared a GPS position yet. Online drivers appear here as soon as their device reports one; RideX never invents a position."
          />

          {ride ? (
            <section data-testid="live-detail" data-ride={ride.code} className="mt-4 rounded-2xl border border-hairline bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Ride {ride.code}</p>
                  <p className="mt-0.5 font-display text-xl font-bold text-ink">{ride.driver ? "Tracking the assigned driver" : "Open request — no driver yet"}</p>
                </div>
                <RideStatusPill status={ride.status} />
              </div>
              {ride.driver && !rideDriverPoint ? (
                <p role="status" data-testid="live-no-location" className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-[0.86rem] font-medium text-brand-dark">
                  Location unavailable. {rideDriver?.gpsState && GPS_REPORT[rideDriver.gpsState] ? GPS_REPORT[rideDriver.gpsState] : "This driver has not shared a GPS position yet."} RideX will not invent one.
                </p>
              ) : null}
              {rideDriverPoint && positionState(rideDriverPoint.seenAt, tick) !== "live" ? (
                <p role="status" data-testid="live-stale" className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-[0.86rem] font-medium text-brand-dark">
                  This driver&apos;s last position is {ago(serverNow - Date.parse(ride.driverSeenAt ?? ""))} old, so it is shown as last known, not live.
                </p>
              ) : null}
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-[0.88rem] sm:grid-cols-2">
                <Detail label="Customer" value={`${ride.customer?.name ?? "—"}${ride.customer?.phone ? ` · ${ride.customer.phone}` : ""}`} />
                <Detail label="Driver" value={ride.driver ? `${ride.driver.name}${ride.driver.phone ? ` · ${ride.driver.phone}` : ""}` : "Not assigned yet"} />
                <Detail label="Vehicle" value={ride.driver ? `${ride.driver.vehicleModel} · ${ride.driver.vehicleNumber}` : `${ride.vehicleType.toUpperCase()} requested`} />
                <Detail label="Driver location" value={rideDriverPoint ? `${positionState(rideDriverPoint.seenAt, tick) === "live" ? "Live" : "Last known"} · ${ago(serverNow - Date.parse(ride.driverSeenAt ?? ""))}` : "Not shared"} testId="live-driver-location" />
                <Detail label="Pickup" value={ride.pickup} />
                <Detail label="Destination" value={ride.destination} />
                <Detail label="Trip" value={`${ride.distanceKm.toFixed(1)} km · about ${ride.durationMin} min · ${formatMoney(ride.fare)}`} />
                <Detail label="Requested" value={ago(serverNow - Date.parse(ride.requestedAt))} />
              </dl>
              <Link href="/admin/rides" className="mt-4 inline-flex text-[0.86rem] font-semibold text-brand">Open in Ride Management →</Link>
            </section>
          ) : null}

          {selDriver ? (
            <section data-testid="live-detail" data-driver={selDriver.name} className="mt-4 rounded-2xl border border-hairline bg-white p-5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Driver</p>
              <p className="mt-0.5 font-display text-xl font-bold text-ink">{selDriver.name}</p>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-[0.88rem] sm:grid-cols-2">
                <Detail label="Status" value={selDriver.online ? "Online" : "Offline"} />
                <Detail label="Approval" value={approvalOf(selDriver).label} />
                <Detail label="Requests" value={(DISPATCH[selDriver.dispatch] ?? { label: selDriver.dispatch }).label} />
                <Detail label="Last seen" value={lastSeenOf(selDriver)} />
                <Detail label="Location" value={selDriver.online ? locationOf(selDriver).text : "Offline drivers are not shown on the map."} />
                <Detail label="Vehicle" value={`${selDriver.vehicleModel} · ${selDriver.vehicleType.toUpperCase()} · ${selDriver.vehicleNumber}`} />
                <Detail label="Contact" value={`${selDriver.phone ?? "no phone"} · ${selDriver.email}`} />
              </dl>
              <Link href="/admin/drivers" className="mt-4 inline-flex text-[0.86rem] font-semibold text-brand">Open in Driver Management →</Link>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 break-words font-medium text-ink">{value}</dd>
    </div>
  );
}
