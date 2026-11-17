import { requireUser } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { bookRide, listMyRides } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json({ rides: await listMyRides(user) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const ride = await bookRide(user, await readJson(request));
    return json({ ride }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
