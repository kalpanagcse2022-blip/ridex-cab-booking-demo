import { drivingRoute } from "@/lib/geo";
import { asNumber, errorResponse, isCoord, json, readJson } from "@/lib/http";
import { HttpError } from "@/lib/http";
import { getFares, quoteFare } from "@/lib/service";
import { CARS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const pickup = (body.pickup ?? {}) as Record<string, unknown>;
    const destination = (body.destination ?? {}) as Record<string, unknown>;
    const pickupLat = asNumber(pickup.lat ?? body.pickupLat);
    const pickupLng = asNumber(pickup.lng ?? body.pickupLng);
    const destinationLat = asNumber(destination.lat ?? body.destinationLat);
    const destinationLng = asNumber(destination.lng ?? body.destinationLng);
    if (!isCoord(pickupLat, pickupLng) || !isCoord(destinationLat, destinationLng)) {
      throw new HttpError(422, "Choose a pickup and destination from the suggestions.");
    }
    const route = await drivingRoute(
      { lat: pickupLat!, lng: pickupLng! },
      { lat: destinationLat!, lng: destinationLng! },
    );
    const rates = await getFares();
    const fares = Object.fromEntries(CARS.map((car) => [car.id, quoteFare(route.distanceKm, rates, car.id)]));
    return json({ route, rates, fares });
  } catch (error) {
    return errorResponse(error);
  }
}
