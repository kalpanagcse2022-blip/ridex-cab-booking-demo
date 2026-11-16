import { createHash, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { HttpError, asString, isEmail } from "@/lib/http";

const MIN_PASSWORD = 10;
const SETUP_LOCK_ID = 727401;

// First-administrator setup. It is open only while NO admin exists, and only when the
// server owner has configured ADMIN_SETUP_CODE. Nothing here ships a default account,
// and the code is never sent to the browser.
export async function adminSetupStatus() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  if (existing) return { open: false, reason: "An administrator already exists. Use Admin Login." };
  if (!process.env.ADMIN_SETUP_CODE) {
    return {
      open: false,
      reason: "First-admin setup is switched off. The server owner must set ADMIN_SETUP_CODE (or ADMIN_EMAIL and ADMIN_PASSWORD) first.",
    };
  }
  return { open: true, reason: null as string | null };
}

function setupCodeMatches(input: string) {
  const expected = process.env.ADMIN_SETUP_CODE ?? "";
  if (!expected) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function createFirstAdmin(input: Record<string, unknown>) {
  const status = await adminSetupStatus();
  if (!status.open) throw new HttpError(403, status.reason ?? "First-admin setup is closed.");

  const name = asString(input.name, 120);
  const email = asString(input.email, 160).toLowerCase();
  const password = asString(input.password, 100);
  const confirm = asString(input.confirmPassword, 100);
  const code = asString(input.setupCode, 200);
  if (name.length < 2) throw new HttpError(422, "Enter the administrator's name.");
  if (!isEmail(email)) throw new HttpError(422, "Enter a valid e-mail address.");
  if (password.length < MIN_PASSWORD) throw new HttpError(422, `Use a password of at least ${MIN_PASSWORD} characters.`);
  if (password !== confirm) throw new HttpError(422, "The two passwords don't match.");
  if (!setupCodeMatches(code)) throw new HttpError(403, "The setup code is not correct.");

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    // Serialise concurrent attempts so two requests can never both create "the first" admin.
    await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_ID})`);
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    if (existing) throw new HttpError(409, "An administrator already exists. Use Admin Login.");
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (taken) throw new HttpError(409, "That e-mail address already belongs to another RideX account.");
    const [created] = await tx
      .insert(users)
      .values({ role: "admin", name, email, passwordHash, status: "active" })
      .returning({ id: users.id });
    await tx.insert(activityLog).values({ actorId: created.id, action: "admin.first_setup", detail: `${name} created the first administrator account` });
  });
  return { message: "Administrator account created. You can sign in now." };
}
