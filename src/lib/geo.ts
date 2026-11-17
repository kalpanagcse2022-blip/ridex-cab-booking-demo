import { HttpError } from "@/lib/http";

export type Place = {
  displayName: string;
  lat: number;
  lng: number;
};

export type DrivingRoute = {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
};

const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "RideX/1.0 (local cab booking demo)";
const NOMINATIM = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
const OSRM = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

async function geoFetch(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new HttpError(502, "The location service didn't respond. Try again in a moment.");
  }
  return response.json() as Promise<unknown>;
}

function toPlace(row: { display_name?: string; lat?: string; lon?: string }): Place | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!row.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { displayName: row.display_name, lat, lng };
}

export async function searchPlaces(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const india = new URL("/search", NOMINATIM);
  india.searchParams.set("q", trimmed);
  india.searchParams.set("format", "jsonv2");
  india.searchParams.set("limit", "6");
  india.searchParams.set("addressdetails", "0");
  india.searchParams.set("countrycodes", "in");
  const indiaRows = (await geoFetch(india.toString())) as { display_name?: string; lat?: string; lon?: string }[];
  const indiaPlaces = (Array.isArray(indiaRows) ? indiaRows : []).map(toPlace).filter((place): place is Place => !!place);
  if (indiaPlaces.length) return indiaPlaces;

  const world = new URL("/search", NOMINATIM);
  world.searchParams.set("q", trimmed);
  world.searchParams.set("format", "jsonv2");
  world.searchParams.set("limit", "6");
  const worldRows = (await geoFetch(world.toString())) as { display_name?: string; lat?: string; lon?: string }[];
  return (Array.isArray(worldRows) ? worldRows : []).map(toPlace).filter((place): place is Place => !!place);
}

export async function reversePlace(lat: number, lng: number) {
  const url = new URL("/reverse", NOMINATIM);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  const row = (await geoFetch(url.toString())) as { display_name?: string; lat?: string; lon?: string; error?: string };
  const place = toPlace({ display_name: row.display_name, lat: row.lat ?? String(lat), lon: row.lon ?? String(lng) });
  if (!place) {
    throw new HttpError(422, "Your location could not be turned into an address. Type a pickup and choose a suggestion.");
  }
  return place;
}

export async function drivingRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const url = `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  let payload: {
    code?: string;
    routes?: { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }[];
  };
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("osrm status");
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new HttpError(502, "The route service didn't respond. Try again in a moment.");
  }
  const route = payload.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (payload.code !== "Ok" || !route || !coordinates || coordinates.length < 2) {
    throw new HttpError(422, "We couldn't calculate a driving route between these places, so the ride can't be booked yet.");
  }
  const distanceKm = Math.round((route.distance ?? 0) / 100) / 10;
  if (distanceKm < 0.2) {
    throw new HttpError(422, "Pickup and destination are too close for a RideX trip.");
  }
  return {
    distanceKm,
    durationMin: Math.max(1, Math.round((route.duration ?? 0) / 60)),
    geometry: coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
  } satisfies DrivingRoute;
}
