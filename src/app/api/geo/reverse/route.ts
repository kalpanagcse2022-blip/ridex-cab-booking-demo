import { reversePlace } from "@/lib/geo";
import { asNumber, errorResponse, isCoord, json } from "@/lib/http";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lat = asNumber(url.searchParams.get("lat"));
    const lng = asNumber(url.searchParams.get("lng"));
    if (!isCoord(lat, lng)) throw new HttpError(422, "A valid location is required.");
    return json({ place: await reversePlace(lat!, lng!) });
  } catch (error) {
    return errorResponse(error);
  }
}
