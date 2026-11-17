import { destroyRequestSession, rejectCrossSiteRequest } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rejectCrossSiteRequest(request);
    await destroyRequestSession(request);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
