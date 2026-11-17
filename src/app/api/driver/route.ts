import { requireUser } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { driverDashboard, setDriverOnline, updateDriverLocation } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    // ?gps= is the driver's own device telling RideX whether GPS is sharing / denied / unavailable.
    return json(await driverDashboard(user, new URL(request.url).searchParams.get("gps")));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await readJson(request);
    if ("lat" in body || "lng" in body) return json(await updateDriverLocation(user, body));
    if (typeof body.online === "boolean") return json(await setDriverOnline(user, body.online));
    return json({ error: "Nothing to update." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
