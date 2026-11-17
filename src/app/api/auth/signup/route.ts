import { createSession, rejectCrossSiteRequest, setSessionCookie } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { ensureReady, signup } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rejectCrossSiteRequest(request);
    await ensureReady();
    const body = await readJson(request);
    const user = await signup(body);
    const session = await createSession(user.id);
    await setSessionCookie(request, session.token, session.expiresAt);
    return json({ user, token: session.token });
  } catch (error) {
    return errorResponse(error);
  }
}
