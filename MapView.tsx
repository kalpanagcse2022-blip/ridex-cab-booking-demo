"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LeafletMap, Polyline, PolylineOptions } from "leaflet";
import { positionState } from "@/lib/constants";

export type MapPoint = { lat: number; lng: number; label: string };
export type LivePoint = MapPoint & { seenAt?: string | null };

type Props = {
  pickup?: MapPoint | null;
  destination?: MapPoint | null;
  driver?: LivePoint | null;
  customer?: LivePoint | null;
  drivers?: LivePoint[];
  route?: [number, number][] | null;
  /** Road route from a live GPS fix to the next stop (dashed). */
  approach?: [number, number][] | null;
  title?: string;
  subtitle?: string;
  height?: string;
  emptyText?: string;
  className?: string;
  /** The trip is over: tracking has stopped, so the map says so instead of "waiting for GPS". */
  ended?: boolean;
  /** true (default): re-fit when a marker moves about 500 m. false: re-fit only when markers appear/disappear or `fitToken` changes. */
  follow?: boolean;
  /** Changing this value re-fits the view once (for example when a different ride is selected). */
  fitToken?: string;
  /** false: the `drivers` fleet is drawn but not used to decide the zoom (so one far-away driver cannot zoom a ride out). */
  fleetInFit?: boolean;
};

const COLORS = { driver: "#f97316", customer: "#16233f", pickup: "#2f80ed", destination: "#e11d48", stale: "#94a3b8" };
const lineKey = (line?: [number, number][] | null) => (line && line.length ? [line.length, line[0], line[line.length - 1]] : 0);

export function RouteMap({
  pickup = null,
  destination = null,
  driver = null,
  customer = null,
  drivers = [],
  route = null,
  approach = null,
  title = "Live tracking",
  subtitle,
  height = "h-[300px]",
  emptyText = "Choose a pickup and destination to see your route.",
  className = "",
  ended = false,
  follow = true,
  fitToken,
  fleetInFit = true,
}: Props) {
  // The map element is held in state (callback ref) so that when it disappears and later
  // comes back, a fresh Leaflet map is built on the NEW element. Holding it in a plain ref
  // left Leaflet bound to the removed element and the returning map stayed blank.
  const [holder, setHolder] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [tileProblem, setTileProblem] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markers = useRef<Record<string, CircleMarker>>({});
  const lines = useRef<{ route?: Polyline; approach?: Polyline }>({});
  const fitKey = useRef("");
  const points = useRef<[number, number][]>([]);
  const recenter = useRef<(() => void) | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // `fleetState` is part of the signature so a parked driver's marker changes colour at the 90 s
  // mark even though no new data arrives.
  const signature = useMemo(
    () =>
      JSON.stringify({
        pickup,
        destination,
        driver,
        customer,
        drivers,
        route: lineKey(route),
        approach: lineKey(approach),
        fitToken,
        fleetState: drivers.map((item) => positionState(item.seenAt, now)).join(),
      }),
    [pickup, destination, driver, customer, drivers, route, approach, fitToken, now],
  );

  // 1) Create the Leaflet map once per map element; destroy it with the element.
  useEffect(() => {
    if (!holder) return;
    let cancelled = false;
    let created: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;
    (async () => {
      try {
        const leaflet = await import("leaflet");
        if (cancelled) return;
        const L = leaflet.default ?? leaflet;
        leafletRef.current = L;
        const instance = L.map(holder, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(instance);
        tiles.on("tileerror", () => setTileProblem(true));
        tiles.on("tileload", () => setTileProblem(false));
        instance.on("zoomend moveend", () => {
          holder.dataset.zoom = String(instance.getZoom());
        });
        observer = new ResizeObserver(() => instance.invalidateSize());
        observer.observe(holder);
        created = instance;
        setMap(instance);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      created?.remove();
      markers.current = {};
      lines.current = {};
      fitKey.current = "";
      points.current = [];
      recenter.current = null;
      setMap(null);
    };
  }, [holder]);

  // 2) Keep the map in step with the data WITHOUT rebuilding it: markers move in place and
  //    the view is only re-fitted when the trip itself changes, never on a routine refresh,
  //    so a rider's own pan/zoom is not thrown away every few seconds.
  useEffect(() => {
    const L = leafletRef.current;
    if (!map || !L || !holder) return;

    const wanted: Record<string, { p: MapPoint; color: string; radius: number }> = {};
    if (pickup) wanted.pickup = { p: pickup, color: COLORS.pickup, radius: 9 };
    if (destination) wanted.destination = { p: destination, color: COLORS.destination, radius: 9 };
    if (customer) wanted.customer = { p: customer, color: COLORS.customer, radius: 10 };
    if (driver) wanted.driver = { p: driver, color: COLORS.driver, radius: 11 };
    drivers.forEach((item, index) => {
      // Orange only while the fix is fresh; an older fix stays on the map as a grey "last known" marker.
      const fresh = positionState(item.seenAt, Date.now()) === "live";
      wanted[`fleet-${index}`] = { p: item, color: fresh ? COLORS.driver : COLORS.stale, radius: 8 };
    });

    for (const key of Object.keys(markers.current)) {
      if (!wanted[key]) {
        markers.current[key].remove();
        delete markers.current[key];
      }
    }
    for (const [key, item] of Object.entries(wanted)) {
      const existing = markers.current[key];
      if (existing) {
        existing.setLatLng([item.p.lat, item.p.lng]);
        existing.setPopupContent(item.p.label);
        existing.setStyle({ fillColor: item.color });
      } else {
        markers.current[key] = L.circleMarker([item.p.lat, item.p.lng], {
          radius: item.radius,
          color: "#ffffff",
          weight: 3,
          fillColor: item.color,
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup(item.p.label);
      }
    }

    const setLine = (name: "route" | "approach", line: [number, number][] | null | undefined, style: PolylineOptions) => {
      const existing = lines.current[name];
      if (!line || line.length < 2) {
        existing?.remove();
        delete lines.current[name];
        return;
      }
      if (existing) existing.setLatLngs(line);
      else lines.current[name] = L.polyline(line, style).addTo(map);
    };
    setLine("route", route, { color: COLORS.driver, weight: 5, opacity: 0.75 });
    setLine("approach", approach, { color: COLORS.pickup, weight: 4, opacity: 0.9, dashArray: "8 10" });

    const all: [number, number][] = Object.values(wanted).map((item) => [item.p.lat, item.p.lng]);
    const forFit: [number, number][] = Object.entries(wanted)
      .filter(([name]) => fleetInFit || !name.startsWith("fleet-"))
      .map(([, item]) => [item.p.lat, item.p.lng]);
    points.current = forFit.length ? forFit : all;
    const fit = () => {
      const pts = points.current;
      if (!pts.length || !holder.clientWidth) return;
      if (pts.length > 1) map.fitBounds(pts, { padding: [42, 42], maxZoom: 16 });
      else map.setView(pts[0], 15);
      holder.dataset.zoom = String(map.getZoom());
    };
    recenter.current = fit;

    // Re-fit only when the trip's anchors change or a live marker first appears. With no
    // pickup/destination (a driver's own GPS on an idle map) follow in ~500 m steps.
    const anchored = pickup || destination;
    const base = anchored
      ? `A:${pickup?.lat},${pickup?.lng}|${destination?.lat},${destination?.lng}|${driver ? "d" : "-"}|${customer ? "c" : "-"}`
      : follow
        ? `F:${all.map(([lat, lng]) => `${Math.round(lat * 200)},${Math.round(lng * 200)}`).join("|")}`
        : `F:${all.length}`;
    const key = `${base}|${fitToken ?? ""}`;
    if (all.length && key !== fitKey.current) {
      fitKey.current = key;
      fit();
    }

    // Plain DOM facts about what is actually drawn (also handy for automated checks).
    holder.dataset.markers = Object.keys(markers.current).sort().join(",");
    if (drivers.length) {
      holder.dataset.fleet = drivers
        .map((item) => `${item.label}@${item.lat.toFixed(4)},${item.lng.toFixed(4)}:${positionState(item.seenAt, Date.now())}`)
        .join(";");
    } else {
      delete holder.dataset.fleet;
    }
    if (driver) {
      holder.dataset.driverLat = String(driver.lat);
      holder.dataset.driverLng = String(driver.lng);
    } else {
      delete holder.dataset.driverLat;
      delete holder.dataset.driverLng;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  const driverState = driver ? positionState(driver.seenAt, now) : "none";
  const customerState = customer ? positionState(customer.seenAt, now) : "none";
  const anyLive = driverState === "live" || customerState === "live" || drivers.some((item) => positionState(item.seenAt, now) === "live");
  const anyKnown = !!driver || !!customer || drivers.length > 0;
  const badge = ended ? "Tracking ended" : anyLive ? "Live" : anyKnown ? "Last known location" : "Waiting for GPS";
  const hasMap = !!(pickup || destination || driver || customer || drivers.length || route?.length || approach?.length);

  return (
    <div className={`overflow-hidden rounded-2xl border border-hairline bg-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="font-display text-[1.02rem] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[0.82rem] text-body">
            {ended ? (
              subtitle ?? "Live tracking has ended."
            ) : (
              <>
                {subtitle ? `${subtitle} • ` : ""}
                {driver
                  ? `${driver.label} last seen ${driver.seenAt ? new Date(driver.seenAt).toLocaleTimeString() : "just now"}`
                  : "Markers appear when a device shares real GPS coordinates."}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {map ? (
            <button type="button" onClick={() => recenter.current?.()} className="rounded-full border border-hairline px-3 py-1 text-[0.75rem] font-semibold text-ink-soft hover:border-brand hover:text-brand-dark">
              Re-center
            </button>
          ) : null}
          <span
            data-testid="live-badge"
            className={`rounded-full px-3 py-1 text-[0.75rem] font-semibold ${
              badge === "Live" ? "bg-brand-soft text-brand-dark" : "bg-panel text-ink-soft"
            }`}
          >
            {badge}
          </span>
        </div>
      </div>
      <div className={`relative ${height} bg-panel`}>
        {hasMap && !failed ? <div ref={setHolder} data-testid="route-map" className="absolute inset-0" /> : null}
        {hasMap && !failed && !map ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-[0.85rem] text-body">Loading map…</div>
        ) : null}
        {!hasMap || failed ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-[0.95rem] font-semibold text-ink">{failed ? "Map unavailable" : "Waiting for live location"}</p>
              <p className="mt-1.5 text-[0.85rem] text-body">
                {failed ? "The map could not load. Last known coordinates stay available in the ride details." : emptyText}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {tileProblem ? (
        <p role="status" className="border-t border-hairline px-5 py-3 text-[0.8rem] font-medium text-brand-dark">
          Map tiles are not loading — check your connection. Marker positions below are still current.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline px-5 py-3 text-[0.78rem] text-body">
        {driver ? <Legend color={COLORS.driver} label={`${driver.label} (${driverState === "live" ? "live" : driverState === "stale" ? "stale" : "waiting"})`} /> : null}
        {customer ? <Legend color={COLORS.customer} label={`Customer (${customerState === "live" ? "live" : customerState === "stale" ? "stale" : "waiting"})`} /> : null}
        {pickup ? <Legend color={COLORS.pickup} label="Pickup" /> : null}
        {destination ? <Legend color={COLORS.destination} label="Destination" /> : null}
        {drivers.length ? <Legend color={COLORS.driver} label={`Online drivers (${drivers.filter((item) => positionState(item.seenAt, now) === "live").length} live)`} /> : null}
        {drivers.some((item) => positionState(item.seenAt, now) !== "live") ? <Legend color={COLORS.stale} label="Last known location" /> : null}
        {route && route.length > 1 ? <Legend color={COLORS.driver} label="Route" /> : null}
        {approach && approach.length > 1 ? <Legend color={COLORS.pickup} label="On the way (dashed)" /> : null}
      </div>
      {driverState === "stale" || customerState === "stale" ? (
        <p className="border-t border-hairline px-5 py-3 text-[0.8rem] font-medium text-brand-dark">
          This location is more than 90 seconds old, so it is not shown as live.
        </p>
      ) : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
