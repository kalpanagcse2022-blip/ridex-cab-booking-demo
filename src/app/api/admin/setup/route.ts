import { createFirstAdmin, adminSetupStatus } from "@/lib/admin-setup";
import { rejectCrossSiteRequest } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { ensureReady } from "@/lib/service";

export const dynamic = "force-dynamic";

// Reports only whether first-admin setup is open. It never reveals the setup code.
export async function GET() {
  try {
    await ensureReady();
    return json(await adminSetupStatus());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    rejectCrossSiteRequest(request);
    await ensureReady();
    return json(await createFirstAdmin(await readJson(request)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
