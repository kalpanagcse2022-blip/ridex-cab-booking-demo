import { requireRole } from "@/lib/auth";
import { CARS, isVehicleType } from "@/lib/constants";
import { asNumber, errorResponse, json, readJson } from "@/lib/http";
import { HttpError } from "@/lib/http";
import { setFares } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireRole(request, "admin");
    const body = await readJson(request);
    const next = { mini: 12, sedan: 18, suv: 24 };
    for (const car of CARS) {
      const value = asNumber(body[car.id]);
      if (!isVehicleType(car.id) || value === null) throw new HttpError(422, "Enter a fare for every vehicle.");
      next[car.id] = value;
    }
    return json({
      rates: await setFares(next),
      message: "Fares saved. New bookings use these rates; existing bookings keep the fare they were booked at.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
