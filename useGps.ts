"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, jsonInit } from "@/lib/client";
import { positionState } from "@/lib/constants";

export type GpsStatus = "off" | "waiting" | "sharing" | "denied" | "unavailable";
export type GpsFix = { lat: number; lng: number; accuracy: number | null; seenAt: string };
export type GpsPayload = { lat: number; lng: number; accuracy: number | null; capturedAt: string };

/**
 * Reads the device's real GPS (browser Geolocation API) while `enabled`, keeps the latest
 * fix for the screen, and hands a fix to `send` at most every `sendEveryMs`.
 *
 * Two sources feed it: watchPosition (fires when the device reports movement) and a
 * "refresh" that asks the device for a brand-new reading every `refreshEveryMs`
 * (maximumAge 0). The refresh matters for a parked car: many browsers stay quiet while the
 * position does not change, and without it a healthy GPS would age into "last known".
 * It never re-sends an old reading with a new timestamp - every timestamp is the device's.
 */
export function useGpsShare({
  enabled,
  send,
  sendEveryMs = 10_000,
  refreshEveryMs = 20_000,
}: {
  enabled: boolean;
  send: (payload: GpsPayload) => Promise<boolean>;
  sendEveryMs?: number;
  refreshEveryMs?: number;
}) {
  const [status, setStatus] = useState<Exclude<GpsStatus, "off">>("waiting");
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const sendRef = useRef(send);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    sendRef.current = send;
  });

  /** Ask the device for a reading now and send it straight away (e.g. when a ride is assigned). */
  const refreshNow = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    // Everything this run puts in state is cleared again in the cleanup below, so each new
    // session starts from "waiting" without setting state synchronously inside the effect.
    const resetState = () => {
      setStatus("waiting");
      setFix(null);
      setSaveFailed(false);
      setSlow(false);
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const timer = window.setTimeout(() => setStatus("unavailable"), 0);
      return () => {
        window.clearTimeout(timer);
        resetState();
      };
    }
    let stopped = false;
    let lastSent = 0;
    let trailing: number | undefined;
    let pending: GpsPayload | null = null;
    let newest: GpsPayload | null = null; // the device's latest real reading, with ITS timestamp

    const flush = (payload: GpsPayload) => {
      lastSent = Date.now();
      sendRef
        .current(payload)
        .then((ok) => {
          if (!stopped) setSaveFailed(!ok);
        })
        .catch(() => {
          if (!stopped) setSaveFailed(true);
        });
    };

    const report = (position: GeolocationPosition) => {
      if (stopped) return;
      const next: GpsFix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        seenAt: new Date(position.timestamp).toISOString(),
      };
      setFix(next);
      setStatus("sharing");
      setSlow(false);
      const payload: GpsPayload = { lat: next.lat, lng: next.lng, accuracy: next.accuracy, capturedAt: next.seenAt };
      newest = payload;
      const wait = sendEveryMs - (Date.now() - lastSent);
      if (wait <= 0) {
        pending = null;
        flush(payload);
        return;
      }
      // Too soon after the last send: keep only the newest reading and send it when the
      // window opens, so the latest position is never silently dropped.
      pending = payload;
      if (trailing === undefined) {
        trailing = window.setTimeout(() => {
          trailing = undefined;
          if (pending && !stopped) {
            const latest = pending;
            pending = null;
            flush(latest);
          }
        }, wait);
      }
    };

    const fail = (error: GeolocationPositionError) => {
      if (stopped) return;
      if (error.code === error.PERMISSION_DENIED) setStatus("denied");
      else if (error.code === error.POSITION_UNAVAILABLE) setStatus("unavailable");
      else setSlow(true); // timeout: keep trying
    };

    const watchId = navigator.geolocation.watchPosition(report, fail, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    });
    const refresh = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(report, fail, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    }, refreshEveryMs);
    refreshRef.current = () => {
      // Send what the device last reported right away (it keeps its own timestamp, so if it
      // is old the server and the rider see it as last known, never as live). A device that
      // is standing still, or a browser that only answers "new reading" requests when the
      // position changes, would otherwise leave the rider waiting. Then ask for a newer one.
      if (newest) flush(newest);
      navigator.geolocation.getCurrentPosition(report, fail, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 });
    };

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(refresh);
      window.clearTimeout(trailing);
      refreshRef.current = () => {};
      resetState();
    };
  }, [enabled, sendEveryMs, refreshEveryMs]);

  return {
    status: (enabled ? status : "off") as GpsStatus,
    fix: enabled ? fix : null,
    saveFailed: enabled && saveFailed,
    slow: enabled && slow,
    refreshNow,
  };
}

export type GpsView = ReturnType<typeof useGpsShare>;

/** One honest sentence about the device's GPS, or null when sharing is switched off. */
export function describeGps(gps: GpsView, now = Date.now()): { tone: "ok" | "warn"; text: string } | null {
  if (gps.status === "off") return null;
  if (gps.status === "denied") {
    return { tone: "warn", text: "Location permission was denied. Allow location for this site in your browser settings so your position can be shared." };
  }
  if (gps.status === "unavailable") {
    return { tone: "warn", text: "Your device can't provide a GPS location right now, so your position is not being shared." };
  }
  if (!gps.fix) {
    return { tone: "warn", text: gps.slow ? "Still looking for a GPS fix… this is taking longer than usual." : "Waiting for location permission and a first GPS fix…" };
  }
  if (gps.saveFailed) {
    return { tone: "warn", text: "Can't reach RideX — your latest location could not be saved. Retrying automatically." };
  }
  if (positionState(gps.fix.seenAt, now) !== "live") {
    return { tone: "warn", text: "Your GPS has not produced a new reading for over 90 seconds, so your location counts as last known, not live." };
  }
  return { tone: "ok", text: `Sharing your live location · last GPS fix ${new Date(gps.fix.seenAt).toLocaleTimeString()}` };
}

type Pt = { lat: number; lng: number };

function distanceM(a: Pt, b: Pt) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type Leg = { distanceKm: number; durationMin: number; geometry: [number, number][]; arrived: boolean };

/**
 * Road distance and ETA from a live GPS fix to a target, using the existing /api/geo
 * route service. Nothing is computed from an old position: when `from` is not live the
 * result is null. Requests are throttled (15 s apart, and only after ~100 m of movement
 * or 60 s) so the public routing service is not hammered.
 */
export function useLiveLeg(from: (Pt & { seenAt?: string | null }) | null, to: Pt | null) {
  // A result is remembered together with the stop it was worked out for, and only shown while
  // that is still the current stop (pickup, then destination). So an old "km to pickup" can never
  // appear under "to your destination", and nothing has to be cleared from inside the effect.
  const [leg, setLeg] = useState<(Leg & { key: string }) | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const last = useRef<{ from: Pt; to: Pt; at: number } | null>(null);
  const seq = useRef(0);
  const fLat = from?.lat;
  const fLng = from?.lng;
  const fSeen = from?.seenAt ?? null;
  const tLat = to?.lat;
  const tLng = to?.lng;
  const targetKey = tLat != null && tLng != null ? `${tLat},${tLng}` : null;

  useEffect(() => {
    if (fLat == null || fLng == null || tLat == null || tLng == null) {
      last.current = null;
      return;
    }
    if (positionState(fSeen) !== "live") return; // never derive an ETA from an old position
    const origin = { lat: fLat, lng: fLng };
    const target = { lat: tLat, lng: tLng };
    const prev = last.current;
    const now = Date.now();
    if (prev && prev.to.lat === target.lat && prev.to.lng === target.lng) {
      if (now - prev.at < 15_000) return;
      if (distanceM(prev.from, origin) < 100 && now - prev.at < 60_000) return;
    }
    last.current = { from: origin, to: target, at: now };
    const mine = ++seq.current;
    const key = `${target.lat},${target.lng}`;
    (async () => {
      try {
        const response = await apiFetch("/api/geo", jsonInit("POST", { pickup: origin, destination: target }));
        const data = await response.json().catch(() => ({}));
        if (mine !== seq.current) return;
        if (response.ok && data.route) {
          setLeg({ distanceKm: data.route.distanceKm, durationMin: data.route.durationMin, geometry: data.route.geometry, arrived: false, key });
          setFailedKey(null);
        } else if (response.status === 422 && /too close/i.test(String(data.error ?? ""))) {
          setLeg({ distanceKm: 0, durationMin: 0, geometry: [], arrived: true, key });
          setFailedKey(null);
        } else {
          last.current = null;
          setFailedKey(key);
        }
      } catch {
        if (mine === seq.current) {
          last.current = null;
          setFailedKey(key);
        }
      }
    })();
  }, [fLat, fLng, fSeen, tLat, tLng]);

  const live = !!from && positionState(fSeen) === "live";
  const current = targetKey && leg && leg.key === targetKey ? leg : null;
  return { leg: live ? current : null, failed: !!targetKey && failedKey === targetKey };
}
