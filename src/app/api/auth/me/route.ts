import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { ensureReady } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureReady();
    const user = await getUserFromRequest(request);
    return json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
