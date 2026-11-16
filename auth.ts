import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { driverProfiles, sessions, users } from "@/db/schema";
import type { Role } from "@/lib/constants";
import { HttpError } from "@/lib/http";

export const SESSION_COOKIE = "ridex_session";
const SESSION_DAYS = 14;

export type DriverPublic = {
  vehicleType: string;
  vehicleModel: string;
  vehicleNumber: string;
  licenseNumber: string;
  approvalStatus: string;
  accessGranted: boolean;
  online: boolean;
  verified: boolean;
  rating: number | null;
  ratingCount: number;
  decisionNote: string | null;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
};

export type PublicUser = {
  id: string;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  city: string | null;
  createdAt: string;
  driver: DriverPublic | null;
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

function toPublicUser(
  user: typeof users.$inferSelect,
  driver?: typeof driverProfiles.$inferSelect | null,
): PublicUser {
  return {
    id: user.id,
    role: user.role as Role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    city: user.city,
    createdAt: user.createdAt.toISOString(),
    driver: driver
      ? {
          vehicleType: driver.vehicleType,
          vehicleModel: driver.vehicleModel,
          vehicleNumber: driver.vehicleNumber,
          licenseNumber: driver.licenseNumber,
          approvalStatus: driver.approvalStatus,
          accessGranted: driver.accessGranted,
          online: driver.online,
          verified: driver.approvalStatus === "approved" && driver.accessGranted,
          rating: driver.ratingCount ? Math.round((driver.ratingSum / driver.ratingCount) * 10) / 10 : null,
          ratingCount: driver.ratingCount,
          decisionNote: driver.decisionNote,
          lat: driver.lat,
          lng: driver.lng,
          locationUpdatedAt: driver.locationUpdatedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function loadPublicUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [driver] =
    user.role === "driver"
      ? await db.select().from(driverProfiles).where(eq(driverProfiles.userId, user.id)).limit(1)
      : [null];
  return toPublicUser(user, driver);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

// "https" if ANY signal says so. A single "http" signal cannot be trusted: the hosted
// preview proxy terminates HTTPS and forwards no scheme header, and Next.js then fills
// in `x-forwarded-proto: http` itself (base-server: `??= isHttps ? 'https' : 'http'`).
// Browsers always send Origin on the login/signup POST, so a same-host https Origin is
// the reliable signal there.
function isHttpsRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto") ?? "";
  if (forwarded.toLowerCase().includes("https")) return true;
  if (/proto=https/i.test(request.headers.get("forwarded") ?? "")) return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      const parsed = new URL(origin);
      if (parsed.host === host && parsed.protocol === "https:") return true;
    } catch {
      /* ignore a malformed Origin */
    }
  }
  return new URL(request.url).protocol === "https:";
}

// Over HTTPS the cookie must work when RideX is shown inside an embedded preview
// (a cross-site iframe). A SameSite=Lax cookie is silently dropped there, so login
// "succeeds" on the server but the browser never keeps the session. SameSite=None
// requires Secure, and Partitioned keeps the cookie scoped to the embedding site.
// Over plain HTTP (local use) None is not allowed, so Lax is kept.
function sessionCookieOptions(request: Request) {
  return isHttpsRequest(request)
    ? ({ httpOnly: true, sameSite: "none", secure: true, partitioned: true, path: "/" } as const)
    : ({ httpOnly: true, sameSite: "lax", secure: false, path: "/" } as const);
}

export async function setSessionCookie(request: Request, token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...sessionCookieOptions(request), expires: expiresAt });
}

// Attributes must match the ones used to set the cookie, otherwise the browser
// treats the expiring cookie as a different cookie and keeps the real one.
export async function clearSessionCookie(request: Request) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(request), expires: new Date(0) });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return null;
}

function cookieToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Browsers label where a request came from in Sec-Fetch-Site. RideX's own pages (also
// when embedded in the preview frame) send "same-origin"; non-browser clients send
// nothing. Because the session cookie can be SameSite=None, anything that arrives as
// "same-site" or "cross-site" must not be able to act through the cookie.
function isCrossSite(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  return !!site && site !== "same-origin" && site !== "none";
}

// Login, sign-up and logout change state without needing an existing session, so they
// get the same protection against being triggered from another site.
export function rejectCrossSiteRequest(request: Request) {
  if (isCrossSite(request)) throw new HttpError(403, "This request must come from the RideX site.");
}

// Every credential the request carries, best first. A stale token left in browser
// storage must not hide a valid session cookie (or the other way round), so each one
// is tried in turn. The cookie is ignored for cross-site state changes.
function candidateTokens(request: Request) {
  const tokens: string[] = [];
  const bearer = bearerToken(request);
  if (bearer) tokens.push(bearer);
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (safeMethod || !isCrossSite(request)) {
    const cookie = cookieToken(request);
    if (cookie && cookie !== bearer) tokens.push(cookie);
  }
  return tokens;
}

export async function getUserFromRequest(request: Request) {
  for (const token of candidateTokens(request)) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (session) return loadPublicUser(session.userId);
  }
  return null;
}

export async function requireUser(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) throw new HttpError(401, "Your sign-in is no longer active. Log in again.");
  if (user.status !== "active") {
    throw new HttpError(403, "This account is suspended. Contact RideX support.");
  }
  return user;
}

export async function requireRole(request: Request, role: Role) {
  const user = await requireUser(request);
  if (user.role !== role) {
    throw new HttpError(403, "You do not have access to this area.");
  }
  return user;
}

export async function destroyRequestSession(request: Request) {
  // Revoke every session the request presented, not just the first one, so logging out
  // really ends the login even when both a stored token and a cookie were sent.
  for (const token of candidateTokens(request)) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  await clearSessionCookie(request);
}
