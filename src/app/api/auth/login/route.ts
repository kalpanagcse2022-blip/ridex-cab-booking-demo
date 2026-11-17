import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, loadPublicUser, rejectCrossSiteRequest, setSessionCookie, verifyPassword } from "@/lib/auth";
import { errorResponse, json, readJson, asString, isEmail } from "@/lib/http";
import { HttpError } from "@/lib/http";
import { ensureReady } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rejectCrossSiteRequest(request);
    await ensureReady();
    const body = await readJson(request);
    const email = asString(body.email, 160).toLowerCase();
    const password = asString(body.password, 100);
    if (!isEmail(email) || !password) throw new HttpError(422, "Enter your email and password.");
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!row || !(await verifyPassword(password, row.passwordHash))) {
      throw new HttpError(401, "That email and password do not match.");
    }
    if (row.status !== "active") throw new HttpError(403, "This account is suspended. Contact RideX support.");
    const user = await loadPublicUser(row.id);
    const session = await createSession(row.id);
    await setSessionCookie(request, session.token, session.expiresAt);
    return json({ user, token: session.token });
  } catch (error) {
    return errorResponse(error);
  }
}
