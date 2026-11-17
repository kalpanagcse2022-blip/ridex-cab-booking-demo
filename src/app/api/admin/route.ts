import { requireRole } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { adminAction, adminLiveSnapshot, adminSnapshot } from "@/lib/service";

export const dynamic = "force-dynamic";

// Every handler re-checks the ADMIN role against the database session on the server.
export async function GET(request: Request) {
  try {
    const admin = await requireRole(request, "admin");
    // ?view=live is the small, frequently-polled payload for the Live Tracking page
    // (drivers + open rides only) instead of the full dashboard snapshot.
    if (new URL(request.url).searchParams.get("view") === "live") return json(await adminLiveSnapshot());
    return json(await adminSnapshot(admin.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireRole(request, "admin");
    return json(await adminAction(admin, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
