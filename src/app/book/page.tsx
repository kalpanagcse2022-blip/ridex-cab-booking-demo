"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "@/components/brand";
import { RouteMap, type MapPoint } from "@/components/MapView";
import { CustomerShell } from "@/components/shells";
import { fieldClass } from "@/components/chrome";
import { apiFetch, jsonInit } from "@/lib/client";
import { CARS, STATUS_LABEL, formatMoney } from "@/lib/constants";

// The ride that is blocking a new booking, as reported by the server from the database.
type OpenRide = { id: string; code: string; status: string; requestedAt: string };

function ageText(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

type Place = { displayName: string; lat: number; lng: number };
type RouteInfo = { distanceKm: number; durationMin: number; geometry: [number, number][] };

export default function BookPage() {
  return (
    <CustomerShell title="Book a Ride" subtitle="Where are you going today?">
      <BookForm />
    </CustomerShell>
  );
}

function BookForm() {
  const router = useRouter();
  const [gps, setGps] = useState<"detecting" | "granted" | "denied" | "unavailable" | "idle">("detecting");
  const [usingCurrent, setUsingCurrent] = useState(false);
  const [pickupText, setPickupText] = useState("");
  const [pickup, setPickup] = useState<Place | null>(null);
  const [destinationText, setDestinationText] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const [vehicle, setVehicle] = useState("sedan");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "demo">("cash");
  const [rates, setRates] = useState<Record<string, number>>({ mini: 12, sedan: 18, suv: 24 });
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [quoted, setQuoted] = useState<Record<string, number> | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRide, setOpenRide] = useState<OpenRide | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const idempotency = useRef(crypto.randomUUID());
  const gpsToken = useRef(0);

  useEffect(() => {
    apiFetch("/api/fares")
      .then((response) => response.json())
      .then((data) => {
        if (data.rates) setRates(data.rates);
      })
      .catch(() => undefined);
  }, []);

  const detect = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps("unavailable");
      return;
    }
    const token = ++gpsToken.current;
    setGps("detecting");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (token !== gpsToken.current) return;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        try {
          const response = await apiFetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
          const data = await response.json();
          if (!response.ok || !data.place) {
            setGps("unavailable");
            setError(data.error ?? "Your location isn't available right now. Type your pickup and choose a suggestion.");
            return;
          }
          setPickup(data.place);
          setPickupText(data.place.displayName);
          setUsingCurrent(true);
          setGps("granted");
        } catch {
          setGps("unavailable");
          setError("Your location isn't available right now. Type your pickup and choose a suggestion.");
        }
      },
      (err) => {
        if (token !== gpsToken.current) return;
        setUsingCurrent(false);
        setGps(err.code === 1 ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => detect(), 0);
    return () => window.clearTimeout(timer);
  }, [detect]);

  useEffect(() => {
    if (!pickup || !destination) {
      const timer = window.setTimeout(() => {
        setRoute(null);
        setRouteError(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const response = await apiFetch("/api/geo", {
          ...jsonInit("POST", { pickup, destination }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!response.ok) {
        setRoute(null);
        setQuoted(null);
        setRouteError(data.error ?? "We couldn't calculate a driving route between these places.");
          return;
        }
        setRoute(data.route);
        if (data.rates) setRates(data.rates);
        if (data.fares) setQuoted(data.fares);
      } catch {
        if (!controller.signal.aborted) setRouteError("The route service didn't respond. Try again in a moment.");
      } finally {
        if (!controller.signal.aborted) setRouteLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [pickup, destination]);

  const fare = route ? quoted?.[vehicle] ?? Math.max(rates[vehicle] ?? 0, Math.round((rates[vehicle] ?? 0) * route.distanceKm)) : null;
  const pickupPoint = useMemo<MapPoint | null>(() => (pickup ? { lat: pickup.lat, lng: pickup.lng, label: `Pickup — ${pickup.displayName}` } : null), [pickup]);
  const destinationPoint = useMemo<MapPoint | null>(() => (destination ? { lat: destination.lat, lng: destination.lng, label: `Destination — ${destination.displayName}` } : null), [destination]);

  const pickupStatus = usingCurrent && pickup
    ? "Using your current location"
    : pickup
      ? "Pickup selected"
      : gps === "detecting"
        ? "Detecting your current location…"
        : gps === "denied"
          ? "Location permission was denied. Type your pickup and choose a suggestion."
          : gps === "unavailable"
            ? "Your location isn't available right now. Type your pickup and choose a suggestion."
            : pickupText && !pickup
              ? "Choose a pickup from the suggestions so we can route from it."
              : "Type your pickup, or use your current location.";
  const destinationStatus = destination ? "Destination selected" : destinationText && !destination ? "Choose a destination from the suggestions." : "Search for a place to see the route and fare.";

  async function confirm() {
    if (lock.current) return;
    if (!pickup) return setError("Choose a pickup: allow location access or pick a suggestion.");
    if (!destination) return setError("Choose a destination from the suggestions.");
    if (!route) return setError(routeError ?? "A driving route is needed before you can confirm.");
    lock.current = true;
    setBusy(true);
    setError(null);
    setOpenRide(null);
    try {
      const response = await apiFetch(
        "/api/rides",
        jsonInit("POST", {
          pickup: pickup.displayName,
          destination: destination.displayName,
          vehicleType: vehicle,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          paymentMethod,
          idempotencyKey: idempotency.current,
        }),
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ride) {
        // Refused because this customer already has an open ride: say which one, so it can be opened.
        if (response.status === 409 && data.code === "OPEN_RIDE_EXISTS" && data.openRide?.id) setOpenRide(data.openRide as OpenRide);
        setError(response.status === 401 ? "Your sign-in is no longer active. Log in again to book your ride." : data.error ?? "We couldn't book your ride right now. Please try again.");
        lock.current = false;
        return;
      }
      router.push(`/rides/${data.ride.id}`);
    } catch {
      setError("Could not reach RideX. Check your connection and try again.");
      lock.current = false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <section className="self-start rounded-2xl border border-hairline bg-white p-6 shadow-[0_28px_60px_-46px_rgba(22,35,63,0.5)] sm:p-7">
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.74rem] font-semibold uppercase tracking-[0.09em] text-muted">Pickup Location</span>
            {pickup && usingCurrent ? <span className="text-[0.76rem] font-semibold text-brand-dark">Current Location</span> : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <PlaceField id="pickup" value={pickupText} placeholder="Enter pickup location" pinClass="text-[#16a34a]" onType={(value) => { setPickupText(value); setPickup(null); setUsingCurrent(false); }} onPick={(place) => { setPickupText(place.displayName); setPickup(place); setUsingCurrent(false); }} />
            <button type="button" onClick={detect} aria-label="Use my current location" title="Use my current location" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e3e6ee] bg-white text-brand hover:border-brand">
              <Icons.Locate className="h-[1.1rem] w-[1.1rem]" />
            </button>
            {pickupText ? (
              <button type="button" aria-label="Clear pickup" onClick={() => { setPickupText(""); setPickup(null); setUsingCurrent(false); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e3e6ee] bg-white text-muted hover:text-ink">
                <Icons.X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <p data-testid="pickup-status" className="mt-2 text-[0.8rem] text-body">{pickupStatus}</p>
        </div>
        <div className="mt-3 rounded-xl border border-hairline bg-white p-4">
          <span className="text-[0.74rem] font-semibold uppercase tracking-[0.09em] text-muted">Destination</span>
          <div className="mt-2 flex items-center gap-2">
            <PlaceField id="drop" value={destinationText} placeholder="Where to?" pinClass="text-[#dc2626]" onType={(value) => { setDestinationText(value); setDestination(null); }} onPick={(place) => { setDestinationText(place.displayName); setDestination(place); }} />
            {destinationText ? (
              <button type="button" aria-label="Clear destination" onClick={() => { setDestinationText(""); setDestination(null); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e3e6ee] bg-white text-muted hover:text-ink">
                <Icons.X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <p data-testid="destination-status" className="mt-2 text-[0.8rem] text-body">{destinationStatus}</p>
        </div>
        <div className="mt-6">
          <p className="text-[0.95rem] font-semibold text-ink">Choose your vehicle</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {CARS.map((car) => {
              const selected = vehicle === car.id;
              return (
                <button key={car.id} type="button" aria-pressed={selected} data-testid={`vehicle-${car.id}`} onClick={() => setVehicle(car.id)} className={`relative rounded-xl border p-3 text-left transition-all ${selected ? "border-brand bg-brand-soft shadow-[0_14px_28px_-20px_rgba(234,88,12,0.8)]" : "border-[#e3e6ee] bg-white hover:border-brand/50"}`}>
                  {selected ? <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-brand text-white"><Icons.Check className="h-3 w-3" /></span> : null}
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-white text-brand" : "bg-panel text-muted"}`}><Icons.Car className="h-5 w-5" /></span>
                  <p className="mt-2 text-[0.94rem] font-semibold text-ink">{car.name.replace("RideX ", "")}</p>
                  <p className="mt-0.5 min-h-[2.2rem] text-[0.76rem] leading-snug text-body">{car.note}</p>
                  <p className="mt-1.5 text-[0.82rem] font-semibold text-brand-dark">₹{rates[car.id] ?? car.rate}/km</p>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-6">
          <p className="text-[0.95rem] font-semibold text-ink">Payment method</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(
              [
                ["cash", "Cash", "Pay your driver at the end of the trip."],
                ["demo", "Online Demo", "Simulated checkout. DEMO — no real money transferred."],
              ] as const
            ).map(([id, label, note]) => {
              const selected = paymentMethod === id;
              return (
                <button key={id} type="button" aria-pressed={selected} data-testid={`payment-${id}`} onClick={() => setPaymentMethod(id)} className={`relative rounded-xl border p-3 text-left transition-all ${selected ? "border-brand bg-brand-soft shadow-[0_14px_28px_-20px_rgba(234,88,12,0.8)]" : "border-[#e3e6ee] bg-white hover:border-brand/50"}`}>
                  {selected ? <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-brand text-white"><Icons.Check className="h-3 w-3" /></span> : null}
                  <p className="text-[0.94rem] font-semibold text-ink">{label}</p>
                  <p className="mt-1 text-[0.76rem] leading-snug text-body">{note}</p>
                </button>
              );
            })}
          </div>
        </div>
        {error ? (
          <div data-testid="booking-error" className="mt-5 rounded-xl bg-brand-soft px-4 py-3 text-[0.88rem] font-medium text-brand-dark">
            <p role="alert">{error}</p>
            {openRide ? (
              <div data-testid="open-ride-notice" className="mt-3 border-t border-orange-200 pt-3">
                <p className="text-[0.82rem] font-normal text-ink-soft">
                  Ride <span className="font-semibold text-ink">{openRide.code}</span> · {STATUS_LABEL[openRide.status as keyof typeof STATUS_LABEL] ?? openRide.status} · requested {ageText(openRide.requestedAt)}.
                  You can book again once it is completed or cancelled — you can cancel it from its page if you no longer need it.
                </p>
                <Link href={`/rides/${openRide.id}`} data-testid="open-existing-ride" className="rx-btn rx-btn-primary mt-3 h-11 w-full px-6 text-[0.95rem]">
                  Open Existing Ride <Icons.ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        <button type="button" data-testid="confirm-ride" onClick={confirm} disabled={busy} className="rx-btn rx-btn-primary mt-5 h-[54px] w-full text-[1.02rem]">
          {busy ? "Booking your ride…" : "Confirm Ride"} <Icons.ArrowRight className="h-[1.15rem] w-[1.15rem]" />
        </button>
      </section>
      <section className="min-w-0">
        <div className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_28px_60px_-46px_rgba(22,35,63,0.5)]">
          <RouteMap pickup={pickupPoint} destination={destinationPoint} route={route?.geometry ?? null} emptyText="Choose a pickup and destination to see your route." height="h-[420px] sm:h-[500px]" title="Your route" subtitle={usingCurrent ? "Pickup uses your current GPS fix" : undefined} />
          {routeLoading ? <p className="border-t border-hairline px-5 py-3 text-[0.86rem] text-body">Calculating the driving route…</p> : null}
          {!routeLoading && routeError ? <p role="alert" className="border-t border-hairline px-5 py-3 text-[0.86rem] font-medium text-brand-dark">{routeError}</p> : null}
          <dl className="grid grid-cols-3 divide-x divide-hairline border-t border-hairline">
            <Stat label="Distance" value={route ? `${route.distanceKm.toFixed(1)} km` : "—"} testId="route-distance" />
            <Stat label="Est. Time" value={route ? `${route.durationMin} mins` : "—"} testId="route-eta" />
            <Stat label="Estimated Fare" value={fare !== null ? formatMoney(fare) : "—"} testId="route-fare" highlight />
          </dl>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, testId, highlight = false }: { label: string; value: string; testId: string; highlight?: boolean }) {
  return (
    <div className="px-3 py-4 text-center sm:px-5">
      <dt className="text-[0.76rem] text-body">{label}</dt>
      <dd data-testid={testId} className={`mt-1 font-display font-bold text-ink ${highlight ? "text-[1.2rem]" : "text-[1.02rem]"}`}>{value}</dd>
    </div>
  );
}

function PlaceField({ id, value, placeholder, pinClass, onType, onPick }: { id: string; value: string; placeholder: string; pinClass: string; onType: (value: string) => void; onPick: (place: Place) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [results, setResults] = useState<Place[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3 || query === picked.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      setMessage(null);
      try {
        const response = await apiFetch(`/api/geo/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setResults([]);
          setStatus("error");
          setMessage(data.error ?? "Could not search places right now.");
          return;
        }
        const places = data.results ?? [];
        setResults(places);
        setMessage(data.error ?? null);
        setStatus(places.length ? "ready" : "empty");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
          setMessage("Could not search places right now.");
        }
      }
    }, 320);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className="relative min-w-0 flex-1">
      <Icons.MapPin className={`pointer-events-none absolute left-3.5 top-1/2 z-10 h-[1.15rem] w-[1.15rem] -translate-y-1/2 ${pinClass}`} />
      <input id={id} name={id} required value={value} autoComplete="off" placeholder={placeholder} onChange={(event) => { picked.current = null; onType(event.target.value); setOpen(true); if (event.target.value.trim().length < 3) { setResults([]); setStatus("idle"); } }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} className={`${fieldClass} pl-10`} />
      {open && status !== "idle" ? (
        <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-64 overflow-y-auto rounded-xl border border-hairline bg-white shadow-[0_20px_40px_-20px_rgba(22,35,63,0.35)]">
          {status === "loading" ? <li className="px-4 py-3 text-[0.88rem] text-body">Searching…</li> : null}
          {status === "empty" ? <li className="px-4 py-3 text-[0.88rem] text-body">No matching places. Try a more specific name.</li> : null}
          {status === "error" ? <li className="px-4 py-3 text-[0.88rem] text-brand-dark">{message}</li> : null}
          {status === "ready"
            ? results.map((place) => (
                <li key={`${place.lat},${place.lng}`}>
                  <button type="button" onMouseDown={(event) => { event.preventDefault(); picked.current = place.displayName; setOpen(false); setResults([]); setStatus("idle"); onPick(place); }} className="flex w-full items-start gap-2 px-4 py-3 text-left text-[0.9rem] text-ink hover:bg-panel">
                    <Icons.MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span>{place.displayName}</span>
                  </button>
                </li>
              ))
            : null}
        </ul>
      ) : null}
    </div>
  );
}
