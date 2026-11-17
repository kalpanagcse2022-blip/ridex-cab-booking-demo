import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  complaints,
  driverProfiles,
  feedback,
  locationUpdates,
  notifications,
  payments,
  rideOffers,
  rides,
  sessions,
  settings,
  users,
} from "@/db/schema";
import { hashPassword, loadPublicUser, verifyPassword, type PublicUser } from "@/lib/auth";
import {
  ACTIVE_RIDE_STATUSES,
  CARS,
  DRIVER_GPS_STATES,
  OPEN_RIDE_STATUSES,
  PRESENCE_MS,
  STALE_LOCATION_MS,
  STATUS_LABEL,
  carFor,
  isVehicleType,
  methodLabel,
  paymentCopy,
  paymentPresentation,
  type PaymentMethod,
  type RideStatus,
  type VehicleType,
} from "@/lib/constants";
import { drivingRoute } from "@/lib/geo";
import { HttpError, asNumber, asString, isCoord, isEmail } from "@/lib/http";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RideRow = typeof rides.$inferSelect;

const DEFAULT_FARES: Record<VehicleType, number> = { mini: 12, sedan: 18, suv: 24 };

// A password that earlier documentation published. It is never accepted as a built-in
// credential anywhere. It exists only so the admin dashboard can warn when a previously
// seeded admin account still uses it (see usesPublishedAdminPassword).
const PUBLISHED_ADMIN_PASSWORDS = ["RideX-Admin-2026"];
const publishedPasswordChecks = new Map<string, boolean>();

async function usesPublishedAdminPassword(adminId: string) {
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, adminId)).limit(1);
  if (!row) return false;
  const cached = publishedPasswordChecks.get(row.hash);
  if (cached !== undefined) return cached;
  let found = false;
  for (const candidate of PUBLISHED_ADMIN_PASSWORDS) {
    if (await verifyPassword(candidate, row.hash)) found = true;
  }
  publishedPasswordChecks.set(row.hash, found);
  return found;
}

let ready: Promise<void> | null = null;

export function ensureReady() {
  if (!ready) {
    ready = bootstrap().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function bootstrap() {
  const [fares] = await db.select().from(settings).where(eq(settings.key, "fares")).limit(1);
  if (!fares) {
    await db.insert(settings).values({ key: "fares", value: DEFAULT_FARES }).onConflictDoNothing();
  }
  const [support] = await db.select().from(settings).where(eq(settings.key, "support")).limit(1);
  if (!support) {
    await db
      .insert(settings)
      .values({
        key: "support",
        value: { email: "support@ridex.app", phone: "+91 44 4000 2026", city: "Chennai" },
      })
      .onConflictDoNothing();
  }
  // First administrator: only when none exists AND the operator supplied credentials
  // through the server environment. There is no built-in default account or password.
  // Without these variables, use the one-time /admin/setup page (needs ADMIN_SETUP_CODE).
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  const seedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const seedPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!admin && isEmail(seedEmail) && seedPassword.length >= 10) {
    await db
      .insert(users)
      .values({
        role: "admin",
        name: "RideX Admin",
        email: seedEmail,
        passwordHash: await hashPassword(seedPassword),
        status: "active",
      })
      .onConflictDoNothing();
  }
}

export async function getFares() {
  await ensureReady();
  const [row] = await db.select().from(settings).where(eq(settings.key, "fares")).limit(1);
  const value = (row?.value ?? {}) as Partial<Record<VehicleType, number>>;
  return {
    mini: clampFare(value.mini ?? DEFAULT_FARES.mini),
    sedan: clampFare(value.sedan ?? DEFAULT_FARES.sedan),
    suv: clampFare(value.suv ?? DEFAULT_FARES.suv),
  };
}

function clampFare(value: number) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 12;
  return Math.min(500, Math.max(1, number));
}

export async function setFares(next: Record<VehicleType, number>) {
  const value = {
    mini: clampFare(next.mini),
    sedan: clampFare(next.sedan),
    suv: clampFare(next.suv),
  };
  await db
    .insert(settings)
    .values({ key: "fares", value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  return value;
}

async function notify(userId: string, title: string, body: string, rideId?: string | null, tx: Tx | typeof db = db) {
  await tx.insert(notifications).values({ userId, title, body, rideId: rideId ?? null });
}

async function notifyAdmins(title: string, body: string, rideId?: string | null, tx: Tx | typeof db = db) {
  const admins = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  if (!admins.length) return;
  await tx.insert(notifications).values(admins.map((admin) => ({ userId: admin.id, title, body, rideId: rideId ?? null })));
}

async function logActivity(actorId: string | null, action: string, detail: string, tx: Tx | typeof db = db) {
  await tx.insert(activityLog).values({ actorId, action, detail });
}

function fareFor(distanceKm: number, rate: number) {
  return Math.max(rate, Math.round(rate * distanceKm));
}

function reference(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function rideCode() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RX-${stamp}${random}`;
}

function paymentView(ride: { status: string; fare: number; paymentStatus: string | null; paymentMethod: string | null; paymentReference: string | null; paidAt: Date | null }, payment?: typeof payments.$inferSelect | null) {
  const method = payment?.method ?? ride.paymentMethod;
  const status = payment?.status ?? ride.paymentStatus ?? "UNPAID";
  const amount = payment?.amount ?? ride.fare;
  const copy = paymentCopy({ rideStatus: ride.status, paymentStatus: status, method });
  return {
    method,
    methodLabel: methodLabel(method),
    status,
    amount,
    reference: payment?.reference ?? ride.paymentReference,
    paidAt: (payment?.confirmedAt ?? ride.paidAt)?.toISOString() ?? null,
    note: payment?.note ?? null,
    customerMessage: copy.customer,
    customerDetail: copy.customerDetail,
    driverMessage: copy.driver,
    driverDetail: copy.driverDetail,
    adminMessage: copy.admin,
    notice: copy.notice,
    tone: copy.tone,
    paid: copy.paid,
    demo: method === "demo",
  };
}

async function peopleByIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, typeof users.$inferSelect>();
  const rows = await db.select().from(users).where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

async function driversByIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, typeof driverProfiles.$inferSelect>();
  const rows = await db.select().from(driverProfiles).where(inArray(driverProfiles.userId, unique));
  return new Map(rows.map((row) => [row.userId, row]));
}

// Contact details are shared on a need-to-know basis: the phone only with ride
// participants and admins, the e-mail address only with admins.
function personBrief(user: typeof users.$inferSelect | undefined, includePhone = false, includeEmail = includePhone) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: includeEmail ? user.email : undefined,
    phone: includePhone ? user.phone : undefined,
  };
}

function driverBrief(user: typeof users.$inferSelect | undefined, profile: typeof driverProfiles.$inferSelect | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    vehicleType: profile?.vehicleType ?? null,
    vehicleModel: profile?.vehicleModel ?? null,
    vehicleNumber: profile?.vehicleNumber ?? null,
    rating: profile?.ratingCount ? Math.round((profile.ratingSum / profile.ratingCount) * 10) / 10 : null,
    ratingCount: profile?.ratingCount ?? 0,
    approvalStatus: profile?.approvalStatus ?? null,
    online: profile?.online ?? false,
  };
}

export async function serializeRide(ride: RideRow, viewer: PublicUser) {
  const ids = [ride.customerId, ride.driverId].filter((id): id is string => !!id);
  const [people, profiles, payment] = await Promise.all([
    peopleByIds(ids),
    driversByIds(ids),
    db.select().from(payments).where(eq(payments.rideId, ride.id)).limit(1).then((rows) => rows[0] ?? null),
  ]);
  const customer = people.get(ride.customerId);
  const driver = ride.driverId ? people.get(ride.driverId) : undefined;
  const profile = ride.driverId ? profiles.get(ride.driverId) : undefined;
  // Participants are the rider, the assigned driver and admins. A driver who is merely
  // offered an open request sees the trip, fare and rider name, but never the rider's
  // phone, e-mail or live position, and never another driver's position.
  const isAdmin = viewer.role === "admin";
  const showContact = isAdmin || viewer.id === ride.customerId || viewer.id === ride.driverId;
  // Live positions are shared only while the trip is open. Once it is completed or
  // cancelled, tracking is over: the coordinates stop being served (the stored history
  // stays in the database).
  const tracking = showContact && ride.status !== "COMPLETED" && ride.status !== "CANCELLED";
  // How many drivers an open request has really been offered to / declined by. Counts only,
  // no identities, and only for the rider and admins. The rider's status card uses it to tell
  // "request sent, nobody to offer it to yet" apart from "sent and waiting for an answer".
  let dispatch: { notified: number; declined: number } | null = null;
  if (ride.status === "REQUESTED" && (isAdmin || viewer.id === ride.customerId)) {
    const offerRows = await db
      .select({ status: rideOffers.status, n: sql<number>`count(*)::int` })
      .from(rideOffers)
      .where(eq(rideOffers.rideId, ride.id))
      .groupBy(rideOffers.status);
    dispatch = {
      notified: offerRows.filter((row) => row.status === "offered").reduce((sum, row) => sum + Number(row.n), 0),
      declined: offerRows.filter((row) => row.status === "rejected").reduce((sum, row) => sum + Number(row.n), 0),
    };
  }
  return {
    id: ride.id,
    code: ride.code,
    status: ride.status,
    statusLabel: STATUS_LABEL[ride.status as RideStatus] ?? ride.status,
    pickup: ride.pickup,
    pickupLat: ride.pickupLat,
    pickupLng: ride.pickupLng,
    destination: ride.destination,
    destinationLat: ride.destinationLat,
    destinationLng: ride.destinationLng,
    vehicleType: ride.vehicleType,
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    fare: ride.fare,
    route: ride.route ?? [],
    customer: personBrief(customer, showContact, isAdmin),
    driver: showContact ? driverBrief(driver, profile) : driver ? { id: driver.id, name: driver.name } : null,
    customerLat: tracking ? ride.customerLat : null,
    customerLng: tracking ? ride.customerLng : null,
    customerSeenAt: tracking ? (ride.customerSeenAt?.toISOString() ?? null) : null,
    driverLat: tracking ? ride.driverLat : null,
    driverLng: tracking ? ride.driverLng : null,
    driverSeenAt: tracking ? (ride.driverSeenAt?.toISOString() ?? null) : null,
    payment: paymentView(ride, payment),
    dispatch,
    paymentStatus: payment?.status ?? ride.paymentStatus,
    paymentMethod: payment?.method ?? ride.paymentMethod,
    customerRating: ride.customerRating,
    customerFeedback: ride.customerFeedback,
    cancelReason: ride.cancelReason,
    requestedAt: ride.requestedAt.toISOString(),
    assignedAt: ride.assignedAt?.toISOString() ?? null,
    arrivedAt: ride.arrivedAt?.toISOString() ?? null,
    startedAt: ride.startedAt?.toISOString() ?? null,
    completedAt: ride.completedAt?.toISOString() ?? null,
    cancelledAt: ride.cancelledAt?.toISOString() ?? null,
  };
}

async function requireDriverProfile(userId: string, tx: Tx | typeof db = db) {
  const [profile] = await tx.select().from(driverProfiles).where(eq(driverProfiles.userId, userId)).limit(1);
  if (!profile) throw new HttpError(403, "This dashboard is for driver accounts.");
  return profile;
}

function canDrive(profile: typeof driverProfiles.$inferSelect) {
  return profile.approvalStatus === "approved" && profile.accessGranted;
}

async function activeRideForDriver(driverId: string, tx: Tx | typeof db = db) {
  const [ride] = await tx
    .select()
    .from(rides)
    .where(and(eq(rides.driverId, driverId), inArray(rides.status, ACTIVE_RIDE_STATUSES)))
    .limit(1);
  return ride ?? null;
}

async function eligibleDrivers(vehicleType: string, exclude: string[] = [], tx: Tx | typeof db = db) {
  const rows = await tx
    .select({ user: users, profile: driverProfiles })
    .from(driverProfiles)
    .innerJoin(users, eq(users.id, driverProfiles.userId))
    .where(
      and(
        eq(users.role, "driver"),
        eq(users.status, "active"),
        eq(driverProfiles.approvalStatus, "approved"),
        eq(driverProfiles.accessGranted, true),
        eq(driverProfiles.online, true),
        // "Online" must also be current: the driver's app has contacted RideX recently.
        gt(driverProfiles.lastSeenAt, new Date(Date.now() - PRESENCE_MS)),
        eq(driverProfiles.vehicleType, vehicleType),
      ),
    );
  const available: typeof rows = [];
  for (const row of rows) {
    if (exclude.includes(row.user.id)) continue;
    const active = await activeRideForDriver(row.user.id, tx);
    if (!active) available.push(row);
  }
  return available;
}

async function offerToDrivers(ride: RideRow, exclude: string[] = [], tx: Tx | typeof db = db) {
  const drivers = await eligibleDrivers(ride.vehicleType, exclude, tx);
  for (const driver of drivers) {
    const [existing] = await tx
      .select()
      .from(rideOffers)
      .where(and(eq(rideOffers.rideId, ride.id), eq(rideOffers.driverId, driver.user.id)))
      .limit(1);
    if (existing?.status === "rejected" || existing?.status === "offered" || existing?.status === "accepted") continue;
    await tx.insert(rideOffers).values({ rideId: ride.id, driverId: driver.user.id, status: "offered" });
    await notify(
      driver.user.id,
      "New ride request",
      `${ride.code}: ${ride.pickup} to ${ride.destination} · ₹${ride.fare}`,
      ride.id,
      tx,
    );
  }
  return drivers.length;
}

// The one place the "you already have an open ride" refusal is built. The message is the
// same as before; the extra fields tell the booking page WHICH ride is blocking, so it can
// offer to open it. Only the caller's own ride is ever described (the lookup above is
// scoped to the signed-in customer), and the status is the one stored in the database.
function openRideConflict(open: { id: string; code: string; status: string; requestedAt: Date }) {
  return new HttpError(409, `You already have an open ride (${open.code}). Open it instead of booking again.`, {
    code: "OPEN_RIDE_EXISTS",
    openRide: { id: open.id, code: open.code, status: open.status, requestedAt: open.requestedAt.toISOString() },
  });
}

export async function bookRide(customer: PublicUser, input: Record<string, unknown>) {
  if (customer.role !== "customer") throw new HttpError(403, "This page is for customer bookings.");
  const pickup = asString(input.pickup, 300);
  const destination = asString(input.destination, 300);
  const vehicleType = asString(input.vehicleType, 20);
  const pickupLat = asNumber(input.pickupLat);
  const pickupLng = asNumber(input.pickupLng);
  const destinationLat = asNumber(input.destinationLat);
  const destinationLng = asNumber(input.destinationLng);
  const idempotencyKey = asString(input.idempotencyKey, 80) || null;
  const methodInput = asString(input.paymentMethod, 10);
  if (methodInput && methodInput !== "cash" && methodInput !== "demo") {
    throw new HttpError(422, "Choose cash or the online demo payment.");
  }
  const paymentMethod = (methodInput || null) as PaymentMethod | null;
  if (!pickup || !destination) throw new HttpError(422, "Choose a pickup and destination from the suggestions.");
  if (!isVehicleType(vehicleType)) throw new HttpError(422, "Choose a vehicle category.");
  if (!isCoord(pickupLat, pickupLng)) throw new HttpError(422, "Choose a pickup: allow location access or pick a suggestion.");
  if (!isCoord(destinationLat, destinationLng)) throw new HttpError(422, "Choose a destination from the suggestions.");

  if (idempotencyKey) {
    const [existing] = await db.select().from(rides).where(eq(rides.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) {
      if (existing.customerId !== customer.id) throw new HttpError(409, "That booking reference is already used.");
      return serializeRide(existing, customer);
    }
  }

  const [open] = await db
    .select()
    .from(rides)
    .where(and(eq(rides.customerId, customer.id), inArray(rides.status, OPEN_RIDE_STATUSES)))
    .orderBy(desc(rides.requestedAt))
    .limit(1);
  if (open) throw openRideConflict(open);

  const route = await drivingRoute({ lat: pickupLat!, lng: pickupLng! }, { lat: destinationLat!, lng: destinationLng! });
  const fares = await getFares();
  const fare = fareFor(route.distanceKm, fares[vehicleType]);

  const created = await db.transaction(async (tx) => {
    // One booking at a time per customer. The checks above are only a fast path: two
    // simultaneous requests (two tabs, a retry, a double submit) could both pass them and
    // create two open rides, or trip over the unique key and fail. Taking a lock per
    // customer and re-checking inside it makes the outcome the same every time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${customer.id}))`);
    if (idempotencyKey) {
      const [again] = await tx.select().from(rides).where(eq(rides.idempotencyKey, idempotencyKey)).limit(1);
      if (again) {
        if (again.customerId !== customer.id) throw new HttpError(409, "That booking reference is already used.");
        return again; // a retry of a booking that already succeeded: same ride, no side effects
      }
    }
    const [stillOpen] = await tx
      .select()
      .from(rides)
      .where(and(eq(rides.customerId, customer.id), inArray(rides.status, OPEN_RIDE_STATUSES)))
      .orderBy(desc(rides.requestedAt))
      .limit(1);
    if (stillOpen) throw openRideConflict(stillOpen);
    let ride: RideRow | undefined;
    for (let attempt = 0; attempt < 4 && !ride; attempt += 1) {
      // onConflictDoNothing keeps the transaction usable if a ride code ever collides;
      // no row comes back and the loop simply tries again with a new code.
      const [inserted] = await tx
        .insert(rides)
        .values({
          code: rideCode(),
          customerId: customer.id,
          status: "REQUESTED",
          pickup,
          pickupLat: pickupLat!,
          pickupLng: pickupLng!,
          destination,
          destinationLat: destinationLat!,
          destinationLng: destinationLng!,
          vehicleType,
          distanceKm: route.distanceKm,
          durationMin: route.durationMin,
          fare,
          route: route.geometry,
          paymentMethod,
          paymentStatus: "UNPAID",
          idempotencyKey,
        })
        .onConflictDoNothing({ target: rides.code })
        .returning();
      ride = inserted;
    }
    if (!ride) throw new HttpError(500, "We couldn't book your ride right now. Please try again.");
    await notify(customer.id, "Ride booked", `${ride.code} is waiting for a driver.`, ride.id, tx);
    await notifyAdmins("New ride request", `${customer.name} booked ${ride.code}.`, ride.id, tx);
    await logActivity(customer.id, "ride.booked", `${ride.code} booked for ₹${fare}`, tx);
    await offerToDrivers(ride, [], tx);
    return ride;
  });
  return serializeRide(created, customer);
}

async function loadRide(id: string) {
  const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
  if (!ride) throw new HttpError(404, "We couldn't load this ride.");
  return ride;
}

function canViewRide(user: PublicUser, ride: RideRow) {
  return user.role === "admin" || user.id === ride.customerId || user.id === ride.driverId;
}

export async function getRide(user: PublicUser, id: string) {
  const ride = await loadRide(id);
  if (!canViewRide(user, ride)) {
    const [offer] = await db
      .select()
      .from(rideOffers)
      .where(and(eq(rideOffers.rideId, id), eq(rideOffers.driverId, user.id)))
      .limit(1);
    // An offered driver may look at the request only while it is still open and they
    // have not declined it; once another driver has it, it is no longer theirs to see.
    if (!offer || offer.status === "rejected" || user.role !== "driver" || ride.status !== "REQUESTED") {
      throw new HttpError(403, "You do not have access to this ride.");
    }
  }
  return serializeRide(ride, user);
}

export async function listMyRides(user: PublicUser) {
  const rows =
    user.role === "driver"
      ? await db.select().from(rides).where(eq(rides.driverId, user.id)).orderBy(desc(rides.requestedAt)).limit(100)
      : await db.select().from(rides).where(eq(rides.customerId, user.id)).orderBy(desc(rides.requestedAt)).limit(100);
  return Promise.all(rows.map((ride) => serializeRide(ride, user)));
}

export async function updateLocation(user: PublicUser, rideId: string, input: Record<string, unknown>) {
  const lat = asNumber(input.lat);
  const lng = asNumber(input.lng);
  if (!isCoord(lat, lng)) throw new HttpError(422, "A valid GPS coordinate is required.");
  const accuracy = asNumber(input.accuracy);
  const captured = asString(input.capturedAt, 40);
  const capturedAt = captured ? new Date(captured) : new Date();
  const seenAt = Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 15_000 ? new Date() : capturedAt;
  const ride = await loadRide(rideId);
  const isCustomer = user.id === ride.customerId;
  const isDriver = user.id === ride.driverId;
  if (!isCustomer && !isDriver) throw new HttpError(403, "Only the customer or assigned driver can share a location for this ride.");
  if (ride.status === "COMPLETED" || ride.status === "CANCELLED") {
    throw new HttpError(409, "Live tracking has stopped for this ride.");
  }
  await db.insert(locationUpdates).values({
    rideId,
    userId: user.id,
    role: isDriver ? "driver" : "customer",
    lat: lat!,
    lng: lng!,
    accuracy,
    capturedAt: seenAt,
    recordedAt: new Date(),
  });
  if (isDriver) {
    await db
      .update(rides)
      .set({ driverLat: lat, driverLng: lng, driverSeenAt: seenAt })
      .where(eq(rides.id, rideId));
    await db
      .update(driverProfiles)
      .set({ lat, lng, locationUpdatedAt: seenAt, lastSeenAt: new Date(), gpsState: "sharing" })
      .where(eq(driverProfiles.userId, user.id));
  } else {
    await db
      .update(rides)
      .set({ customerLat: lat, customerLng: lng, customerSeenAt: seenAt })
      .where(eq(rides.id, rideId));
  }
  return { ok: true, seenAt: seenAt.toISOString(), stale: Date.now() - seenAt.getTime() >= 90_000 };
}

async function assertDriverCanTake(profile: typeof driverProfiles.$inferSelect, ride: RideRow) {
  if (!canDrive(profile)) {
    throw new HttpError(403, "Only approved drivers with access granted can accept rides.");
  }
  if (!profile.online) throw new HttpError(403, "Go online before accepting a ride.");
  if (profile.vehicleType !== ride.vehicleType) {
    throw new HttpError(403, "This request is for a different vehicle category.");
  }
}

export async function rideAction(user: PublicUser, rideId: string, input: Record<string, unknown>) {
  const action = asString(input.action, 40);
  const ride = await loadRide(rideId);

  if (action === "accept" || action === "reject" || action === "status" || action === "cancel") {
    if (user.role === "driver" && (action === "accept" || action === "reject" || action === "status")) {
      return driverRideAction(user, ride, action);
    }
    if (action === "cancel") return cancelRide(user, ride, asString(input.reason, 300));
  }
  if (action === "pay_demo" || action === "pay_cash") return customerPay(user, ride, action === "pay_demo" ? "demo" : "cash");
  if (action === "confirm_cash") return confirmCash(user, ride);
  if (action === "rate") return rateRide(user, ride, input);
  if (action === "complaint") return addComplaint(user, ride, asString(input.description, 1000));
  throw new HttpError(400, "That action is not available.");
}

async function driverRideAction(user: PublicUser, ride: RideRow, action: string) {
  const profile = await requireDriverProfile(user.id);
  if (action === "accept") {
    await assertDriverCanTake(profile, ride);
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from rides where id = ${ride.id} for update`);
      const [current] = await tx.select().from(rides).where(eq(rides.id, ride.id)).limit(1);
      if (!current || current.status !== "REQUESTED" || current.driverId) {
        throw new HttpError(409, "Another driver already accepted this ride.");
      }
      const [rejected] = await tx
        .select()
        .from(rideOffers)
        .where(and(eq(rideOffers.rideId, ride.id), eq(rideOffers.driverId, user.id), eq(rideOffers.status, "rejected")))
        .limit(1);
      if (rejected) throw new HttpError(403, "You already declined this request.");
      const active = await activeRideForDriver(user.id, tx);
      if (active) throw new HttpError(409, "Finish your current ride before accepting another.");
      const [saved] = await tx
        .update(rides)
        .set({ driverId: user.id, status: "DRIVER_ASSIGNED", assignedAt: new Date() })
        .where(and(eq(rides.id, ride.id), eq(rides.status, "REQUESTED"), isNull(rides.driverId)))
        .returning();
      if (!saved) throw new HttpError(409, "Another driver already accepted this ride.");
      await tx
        .insert(rideOffers)
        .values({ rideId: ride.id, driverId: user.id, status: "accepted" })
        .onConflictDoUpdate({ target: [rideOffers.rideId, rideOffers.driverId], set: { status: "accepted" } });
      await notify(current.customerId, "Driver accepted", `${user.name} accepted ${current.code} and is heading to pickup.`, current.id, tx);
      await notifyAdmins("Ride assigned", `${user.name} accepted ${current.code}.`, current.id, tx);
      await logActivity(user.id, "ride.accepted", `${current.code} accepted by ${user.name}`, tx);
      return saved;
    });
    return { message: `You accepted ${updated.code}. The customer has been notified and can see your details.`, ride: await serializeRide(updated, user) };
  }

  if (action === "reject") {
    if (ride.status !== "REQUESTED") throw new HttpError(409, "This request is no longer open.");
    await db
      .insert(rideOffers)
      .values({ rideId: ride.id, driverId: user.id, status: "rejected" })
      .onConflictDoUpdate({ target: [rideOffers.rideId, rideOffers.driverId], set: { status: "rejected" } });
    await notify(ride.customerId, "Driver declined", `A driver declined ${ride.code}. It stays open for other drivers.`, ride.id);
    const others = await offerToDrivers(ride, [user.id]);
    await logActivity(user.id, "ride.rejected", `${ride.code} declined by ${user.name}`, db);
    return {
      message: others
        ? `${ride.code} was declined and stays open for other drivers.`
        : `${ride.code} was declined. No other eligible driver is online right now.`,
      ride: await serializeRide(ride, user),
    };
  }

  if (ride.driverId !== user.id) throw new HttpError(403, "This ride is not assigned to you.");
  const next = nextDriverStatus(ride.status);
  if (!next) throw new HttpError(409, "This ride cannot be advanced from its current status.");
  const now = new Date();
  const patch: Partial<typeof rides.$inferInsert> = { status: next.status };
  if (next.status === "DRIVER_ARRIVED") patch.arrivedAt = now;
  if (next.status === "IN_RIDE") patch.startedAt = now;
  if (next.status === "COMPLETED") patch.completedAt = now;
  const [saved] = await db.update(rides).set(patch).where(and(eq(rides.id, ride.id), eq(rides.status, ride.status))).returning();
  if (!saved) throw new HttpError(409, "The ride status changed before that action could be saved.");
  await notify(saved.customerId, next.title, `${saved.code}: ${next.body}`, saved.id);
  await notifyAdmins(next.title, `${saved.code} is now ${next.status}.`, saved.id);
  await logActivity(user.id, `ride.${next.status.toLowerCase()}`, `${saved.code} moved to ${next.status}`, db);
  return { message: next.driverMessage, ride: await serializeRide(saved, user) };
}

function nextDriverStatus(status: string) {
  if (status === "DRIVER_ASSIGNED") {
    return { status: "DRIVER_ARRIVED" as RideStatus, title: "Driver arrived", body: "Your driver is waiting at the pickup point.", driverMessage: "Marked as arrived. The customer has been notified." };
  }
  if (status === "DRIVER_ARRIVED") {
    return { status: "IN_RIDE" as RideStatus, title: "Ride started", body: "You are on your way to the destination.", driverMessage: "Ride started. Live tracking continues until you complete the trip." };
  }
  if (status === "IN_RIDE") {
    return { status: "COMPLETED" as RideStatus, title: "Ride completed", body: "Thanks for riding with RideX. Payment can now be confirmed.", driverMessage: "Ride completed. Payment stays pending until cash or the demo payment is confirmed." };
  }
  return null;
}

async function cancelRide(user: PublicUser, ride: RideRow, reason: string) {
  if (user.role === "customer" && user.id !== ride.customerId) throw new HttpError(403, "You can only cancel your own ride.");
  if (user.role === "driver" && user.id !== ride.driverId) throw new HttpError(403, "You can only cancel a ride assigned to you.");
  if (user.role !== "customer" && user.role !== "driver" && user.role !== "admin") throw new HttpError(403, "You cannot cancel this ride.");
  if (ride.status === "COMPLETED" || ride.status === "CANCELLED") throw new HttpError(409, "This ride is already finished.");
  if (ride.status === "IN_RIDE" && user.role !== "admin") throw new HttpError(409, "A trip that has started can only be completed, not cancelled.");

  if (user.role === "driver" && (ride.status === "DRIVER_ASSIGNED" || ride.status === "DRIVER_ARRIVED")) {
    const reopened = await db.transaction(async (tx) => {
      const [saved] = await tx
        .update(rides)
        .set({
          status: "REQUESTED",
          driverId: null,
          assignedAt: null,
          arrivedAt: null,
          driverLat: null,
          driverLng: null,
          driverSeenAt: null,
        })
        .where(and(eq(rides.id, ride.id), eq(rides.driverId, user.id)))
        .returning();
      if (!saved) throw new HttpError(409, "This ride is no longer assigned to you.");
      await tx
        .insert(rideOffers)
        .values({ rideId: ride.id, driverId: user.id, status: "rejected" })
        .onConflictDoUpdate({ target: [rideOffers.rideId, rideOffers.driverId], set: { status: "rejected" } });
      await notify(saved.customerId, "Looking for another driver", `${saved.code} was released and is being offered to other drivers.`, saved.id, tx);
      await offerToDrivers(saved, [user.id], tx);
      await logActivity(user.id, "ride.reassigned", `${saved.code} released by ${user.name}`, tx);
      return saved;
    });
    return { message: `${reopened.code} was cancelled and is being offered to other drivers.`, ride: await serializeRide(reopened, user) };
  }

  if (user.role === "customer" && !["REQUESTED", "DRIVER_ASSIGNED", "DRIVER_ARRIVED"].includes(ride.status)) {
    throw new HttpError(409, "This ride can no longer be cancelled.");
  }
  const [saved] = await db
    .update(rides)
    .set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason || "Cancelled", paymentStatus: "UNPAID" })
    .where(and(eq(rides.id, ride.id), inArray(rides.status, ["REQUESTED", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_RIDE"])))
    .returning();
  if (!saved) throw new HttpError(409, "This ride can no longer be cancelled.");
  if (saved.driverId) await notify(saved.driverId, "Ride cancelled", `${saved.code} was cancelled.`, saved.id);
  if (user.id !== saved.customerId) await notify(saved.customerId, "Ride cancelled", `${saved.code} was cancelled.`, saved.id);
  await notifyAdmins("Ride cancelled", `${saved.code} was cancelled.`, saved.id);
  await logActivity(user.id, "ride.cancelled", `${saved.code} cancelled`, db);
  return { message: "Ride cancelled.", ride: await serializeRide(saved, user) };
}

async function customerPay(user: PublicUser, ride: RideRow, method: PaymentMethod) {
  if (user.id !== ride.customerId) throw new HttpError(403, "You can only pay for your own ride.");
  if (ride.status !== "COMPLETED") throw new HttpError(409, "Payment opens after the ride is completed.");
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from rides where id = ${ride.id} for update`);
    const [current] = await tx.select().from(rides).where(eq(rides.id, ride.id)).limit(1);
    if (!current) throw new HttpError(404, "We couldn't load this ride.");
    const [existing] = await tx.select().from(payments).where(eq(payments.rideId, ride.id)).limit(1);
    if (existing?.status === "PAID" || current.paymentStatus === "PAID") {
      throw new HttpError(409, "This ride is already marked paid. Duplicate payments are not recorded.");
    }
    const now = new Date();
    if (method === "demo") {
      const ref = reference("DEMO");
      if (existing) {
        await tx
          .update(payments)
          .set({
            method: "demo",
            status: "PAID",
            amount: current.fare,
            reference: ref,
            note: "DEMO — No real money transferred",
            confirmedBy: user.id,
            confirmedAt: now,
            driverId: current.driverId,
          })
          .where(eq(payments.id, existing.id));
      } else {
        await tx.insert(payments).values({
          rideId: current.id,
          customerId: current.customerId,
          driverId: current.driverId,
          method: "demo",
          amount: current.fare,
          status: "PAID",
          reference: ref,
          note: "DEMO — No real money transferred",
          confirmedBy: user.id,
          confirmedAt: now,
        });
      }
      const [saved] = await tx
        .update(rides)
        .set({ paymentMethod: "demo", paymentStatus: "PAID", paymentReference: ref, paidAt: now })
        .where(eq(rides.id, current.id))
        .returning();
      await notify(user.id, "Payment Successful", `${current.code}: Amount successfully credited. Demo payment — no real money was transferred.`, current.id, tx);
      if (current.driverId) {
        await notify(current.driverId, "Payment Received", `${current.code}: Amount successfully credited. Demo payment — no real money was transferred.`, current.id, tx);
      }
      await notifyAdmins("Payment recorded (demo)", `${current.code} demo payment ${ref} for ₹${current.fare}. No real money transferred.`, current.id, tx);
      await logActivity(user.id, "payment.demo", `${current.code} demo payment ${ref}`, tx);
      return saved!;
    }
    const ref = existing?.reference?.startsWith("CASH-") ? existing.reference : reference("CASH");
    if (existing) {
      await tx
        .update(payments)
        .set({
          method: "cash",
          status: "PENDING",
          amount: current.fare,
          reference: ref,
          note: "Cash selected. Waiting for driver confirmation. No online transfer.",
          driverId: current.driverId,
          confirmedAt: null,
          confirmedBy: null,
        })
        .where(eq(payments.id, existing.id));
    } else {
      await tx.insert(payments).values({
        rideId: current.id,
        customerId: current.customerId,
        driverId: current.driverId,
        method: "cash",
        amount: current.fare,
        status: "PENDING",
        reference: ref,
        note: "Cash selected. Waiting for driver confirmation. No online transfer.",
      });
    }
    const [saved] = await tx
      .update(rides)
      .set({ paymentMethod: "cash", paymentStatus: "PENDING", paymentReference: ref, paidAt: null })
      .where(eq(rides.id, current.id))
      .returning();
    if (current.driverId) await notify(current.driverId, "Cash selected", `${current.code}: confirm cash only after you receive ₹${current.fare}.`, current.id, tx);
    await logActivity(user.id, "payment.cash_selected", `${current.code} cash pending`, tx);
    return saved!;
  });
  return {
    message: method === "demo" ? "Payment Successful" : "Cash selected. Your driver will confirm once the cash is received.",
    ride: await serializeRide(result, user),
  };
}

async function confirmCash(user: PublicUser, ride: RideRow) {
  if (user.role !== "driver" || user.id !== ride.driverId) throw new HttpError(403, "Only the assigned driver can confirm cash.");
  if (ride.status !== "COMPLETED") throw new HttpError(409, "Complete the ride before confirming payment.");
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from rides where id = ${ride.id} for update`);
    const [current] = await tx.select().from(rides).where(eq(rides.id, ride.id)).limit(1);
    const [payment] = await tx.select().from(payments).where(eq(payments.rideId, ride.id)).limit(1);
    if (payment?.status === "PAID" || current?.paymentStatus === "PAID") {
      throw new HttpError(409, "This payment was already confirmed.");
    }
    // Cash can be confirmed when the rider picked it while booking or tapped "Pay cash",
    // never when they chose the online demo payment.
    const cashChosen = payment ? payment.method === "cash" : current?.paymentMethod === "cash";
    if (!cashChosen) throw new HttpError(409, "The rider did not choose cash for this ride.");
    const now = new Date();
    const cashRef = payment?.reference?.startsWith("CASH-") ? payment.reference : reference("CASH");
    const cashNote = "Cash confirmed by driver. No online transfer.";
    if (payment) {
      await tx
        .update(payments)
        .set({ method: "cash", status: "PAID", reference: cashRef, note: cashNote, confirmedBy: user.id, confirmedAt: now })
        .where(eq(payments.id, payment.id));
    } else {
      await tx.insert(payments).values({
        rideId: ride.id,
        customerId: ride.customerId,
        driverId: ride.driverId,
        method: "cash",
        amount: ride.fare,
        status: "PAID",
        reference: cashRef,
        note: cashNote,
        confirmedBy: user.id,
        confirmedAt: now,
      });
    }
    const [saved] = await tx
      .update(rides)
      .set({ paymentMethod: "cash", paymentStatus: "PAID", paymentReference: cashRef, paidAt: now })
      .where(eq(rides.id, ride.id))
      .returning();
    await notify(ride.customerId, "Payment Successful", `${ride.code}: cash confirmed by your driver. Nothing was charged online.`, ride.id, tx);
    await notify(user.id, "Payment Received", `${ride.code}: cash marked as received.`, ride.id, tx);
    await notifyAdmins("Cash payment confirmed", `${ride.code} cash ₹${ride.fare} confirmed.`, ride.id, tx);
    await logActivity(user.id, "payment.cash_confirmed", `${ride.code} cash confirmed`, tx);
    return saved!;
  });
  return { message: "Payment Received", ride: await serializeRide(result, user) };
}

async function rateRide(user: PublicUser, ride: RideRow, input: Record<string, unknown>) {
  if (user.id !== ride.customerId) throw new HttpError(403, "Only the rider can rate this trip.");
  if (ride.status !== "COMPLETED") throw new HttpError(409, "You can rate a ride after it is completed.");
  const rating = asNumber(input.rating);
  const comment = asString(input.feedback ?? input.comment, 1000);
  if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) throw new HttpError(422, "Choose a rating from 1 to 5.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from rides where id = ${ride.id} for update`);
    const [current] = await tx.select().from(rides).where(eq(rides.id, ride.id)).limit(1);
    if (current?.customerRating) throw new HttpError(409, "Feedback was already saved for this ride.");
    try {
      await tx.insert(feedback).values({
        rideId: ride.id,
        customerId: user.id,
        driverId: ride.driverId,
        rating,
        comment: comment || null,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new HttpError(409, "Feedback was already saved for this ride.");
      }
      throw error;
    }
    await tx.update(rides).set({ customerRating: rating, customerFeedback: comment || null }).where(eq(rides.id, ride.id));
    if (ride.driverId) {
      const [profile] = await tx.select().from(driverProfiles).where(eq(driverProfiles.userId, ride.driverId)).limit(1);
      if (profile) {
        await tx
          .update(driverProfiles)
          .set({ ratingSum: profile.ratingSum + rating, ratingCount: profile.ratingCount + 1 })
          .where(eq(driverProfiles.userId, ride.driverId));
      }
      await notify(ride.driverId, "New rating", `${user.name} rated ${ride.code} ${rating}/5.`, ride.id, tx);
    }
    await logActivity(user.id, "ride.rated", `${ride.code} rated ${rating}`, tx);
  });
  const fresh = await loadRide(ride.id);
  return { message: "Thanks for the feedback.", ride: await serializeRide(fresh, user) };
}

async function addComplaint(user: PublicUser, ride: RideRow, description: string) {
  if (user.id !== ride.customerId && user.role !== "admin") throw new HttpError(403, "You can only send feedback for your own ride.");
  if (description.length < 8) throw new HttpError(422, "Add a few more details so support can follow up.");
  const [existing] = await db
    .select()
    .from(complaints)
    .where(and(eq(complaints.rideId, ride.id), eq(complaints.customerId, user.id), inArray(complaints.status, ["OPEN", "IN_REVIEW"])))
    .limit(1);
  if (existing) throw new HttpError(409, "An open complaint already exists for this ride.");
  const [created] = await db
    .insert(complaints)
    .values({
      rideId: ride.id,
      customerId: user.id,
      driverId: ride.driverId,
      description,
      status: "OPEN",
    })
    .returning();
  await notifyAdmins("New complaint", `${ride.code}: ${description.slice(0, 140)}`, ride.id);
  await logActivity(user.id, "complaint.created", `${ride.code} complaint opened`, db);
  return { message: "Your complaint was sent to RideX support.", complaint: created, ride: await serializeRide(ride, user) };
}

// The driver dashboard refreshes every few seconds while it is open, so each refresh doubles as the
// "driver is here" signal. It is written at most every 20 s (or at once when the GPS report changes).
async function touchDriver(profile: typeof driverProfiles.$inferSelect, gps: string | null) {
  let reported = gps && (DRIVER_GPS_STATES as readonly string[]).includes(gps) ? gps : null;
  // A refresh that was already in flight when the driver switched online/offline can carry the old GPS
  // state. The server knows the switch happened, so: an offline driver is never "sharing", and an
  // online driver is never "off" (that is only the moment before their GPS starts).
  if (!profile.online) reported = "off";
  else if (reported === "off") reported = null;
  const due = !profile.lastSeenAt || Date.now() - profile.lastSeenAt.getTime() > 20_000;
  if (!due && (!reported || reported === profile.gpsState)) return;
  await db
    .update(driverProfiles)
    .set({ lastSeenAt: new Date(), ...(reported ? { gpsState: reported } : {}) })
    .where(eq(driverProfiles.userId, profile.userId));
}

export async function driverDashboard(user: PublicUser, gps: string | null = null) {
  if (user.role !== "driver") throw new HttpError(403, "This dashboard is for driver accounts. Sign in with your driver login to continue.");
  const profile = await requireDriverProfile(user.id);
  await touchDriver(profile, gps);
  const [history, offers, current] = await Promise.all([
    db.select().from(rides).where(eq(rides.driverId, user.id)).orderBy(desc(rides.requestedAt)).limit(50),
    db.select().from(rideOffers).where(eq(rideOffers.driverId, user.id)),
    activeRideForDriver(user.id),
  ]);
  const rejected = new Set(offers.filter((offer) => offer.status === "rejected").map((offer) => offer.rideId));
  let requests: RideRow[] = [];
  if (canDrive(profile) && profile.online && !current) {
    const open = await db
      .select()
      .from(rides)
      .where(and(eq(rides.status, "REQUESTED"), eq(rides.vehicleType, profile.vehicleType), isNull(rides.driverId)))
      .orderBy(desc(rides.requestedAt))
      .limit(20);
    requests = open.filter((ride) => !rejected.has(ride.id));
  }
  const completed = history.filter((ride) => ride.status === "COMPLETED");
  const ratings = completed.filter((ride) => ride.customerRating);
  const serializedRequests = await Promise.all(requests.map((ride) => serializeRide(ride, user)));
  const serializedHistory = await Promise.all(history.map((ride) => serializeRide(ride, user)));
  const latestPaid = serializedHistory.find((ride) => ride.paymentStatus === "PAID");
  return {
    verified: canDrive(profile),
    approvalStatus: profile.approvalStatus,
    accessGranted: profile.accessGranted,
    accessRevoked: profile.approvalStatus === "approved" && !profile.accessGranted,
    online: profile.online,
    canGoOnline: canDrive(profile) && user.status === "active",
    statusMessage: driverStatusMessage(profile, user.status),
    vehicle: {
      type: profile.vehicleType,
      model: profile.vehicleModel,
      number: profile.vehicleNumber,
      licenseNumber: profile.licenseNumber,
      name: carFor(profile.vehicleType).name,
    },
    currentRide: current ? await serializeRide(current, user) : null,
    requests: serializedRequests,
    history: serializedHistory,
    stats: {
      completedTrips: completed.length,
      earnings: completed.reduce((sum, ride) => sum + ride.fare, 0),
      paidAmount: completed.filter((ride) => ride.paymentStatus === "PAID").reduce((sum, ride) => sum + ride.fare, 0),
      averageRating: ratings.length ? Math.round((ratings.reduce((sum, ride) => sum + (ride.customerRating ?? 0), 0) / ratings.length) * 10) / 10 : null,
      ratingCount: ratings.length,
    },
    latestPayment: latestPaid
      ? { code: latestPaid.code, message: latestPaid.payment.driverMessage, amount: latestPaid.fare, method: latestPaid.payment.methodLabel }
      : null,
  };
}

function driverStatusMessage(profile: typeof driverProfiles.$inferSelect, accountStatus: string) {
  if (accountStatus !== "active") return "This driver account is suspended.";
  if (profile.approvalStatus === "rejected") {
    const reason = profile.decisionNote?.trim();
    return reason && reason !== "Application not approved"
      ? `Your application was not approved. Reason: ${reason}`
      : "Your application was not approved.";
  }
  if (profile.approvalStatus !== "approved") return "Your driver account is awaiting verification by a RideX admin.";
  if (!profile.accessGranted) return "Your online access was revoked. An administrator must grant access before you can go online.";
  if (!profile.online) return "You are offline. New ride requests will not reach you.";
  return "You are online and can receive ride requests.";
}

export async function setDriverOnline(user: PublicUser, online: boolean) {
  const profile = await requireDriverProfile(user.id);
  if (online && !canDrive(profile)) throw new HttpError(403, driverStatusMessage(profile, user.status));
  let releasedRide: string | null = null;
  if (!online) {
    const active = await activeRideForDriver(user.id);
    if (active?.status === "IN_RIDE") throw new HttpError(409, "Finish the trip in progress before going offline.");
    if (active && (active.status === "DRIVER_ASSIGNED" || active.status === "DRIVER_ARRIVED")) {
      await cancelRide(user, active, "Driver went offline");
      releasedRide = active.code;
    }
  }
  await db
    .update(driverProfiles)
    .set({ online, lastSeenAt: new Date(), gpsState: online ? "waiting" : "off" })
    .where(eq(driverProfiles.userId, user.id));
  if (online) {
    const open = await db
      .select()
      .from(rides)
      .where(and(eq(rides.status, "REQUESTED"), eq(rides.vehicleType, profile.vehicleType), isNull(rides.driverId)))
      .limit(20);
    for (const ride of open) await offerToDrivers(ride, []);
  }
  await logActivity(user.id, online ? "driver.online" : "driver.offline", user.name, db);
  const statusMessage = online
    ? "You are online and can receive ride requests."
    : releasedRide
      ? `You are offline. ${releasedRide} was released and is being offered to other drivers.`
      : "You are offline. New ride requests will not reach you.";
  // The reply carries the saved state so the screen can update straight away.
  return {
    online,
    canGoOnline: canDrive(profile),
    verified: canDrive(profile),
    approvalStatus: profile.approvalStatus,
    accessGranted: profile.accessGranted,
    statusMessage,
    releasedRide,
  };
}

export async function updateDriverLocation(user: PublicUser, input: Record<string, unknown>) {
  if (user.role !== "driver") throw new HttpError(403, "Only drivers can share a driver location.");
  const lat = asNumber(input.lat);
  const lng = asNumber(input.lng);
  if (!isCoord(lat, lng)) throw new HttpError(422, "A valid GPS coordinate is required.");
  const captured = asString(input.capturedAt, 40);
  const capturedAt = captured ? new Date(captured) : new Date();
  const seenAt = Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 15_000 ? new Date() : capturedAt;
  await db.update(driverProfiles).set({ lat, lng, locationUpdatedAt: seenAt, lastSeenAt: new Date(), gpsState: "sharing" }).where(eq(driverProfiles.userId, user.id));
  const active = await activeRideForDriver(user.id);
  if (active) {
    await db.insert(locationUpdates).values({
      rideId: active.id,
      userId: user.id,
      role: "driver",
      lat: lat!,
      lng: lng!,
      accuracy: asNumber(input.accuracy),
      capturedAt: seenAt,
    });
    await db.update(rides).set({ driverLat: lat, driverLng: lng, driverSeenAt: seenAt }).where(eq(rides.id, active.id));
  }
  return { ok: true, seenAt: seenAt.toISOString(), stale: Date.now() - seenAt.getTime() >= 90_000 };
}

export async function signup(input: Record<string, unknown>) {
  await ensureReady();
  const role = asString(input.role, 20);
  const name = asString(input.name, 120);
  const email = asString(input.email, 160).toLowerCase();
  const phone = asString(input.phone, 32);
  const password = asString(input.password, 100);
  const city = asString(input.city, 80);
  if (role !== "customer" && role !== "driver") throw new HttpError(400, "Choose a customer or driver account.");
  if (name.length < 2) throw new HttpError(422, "Enter your full name.");
  if (!isEmail(email)) throw new HttpError(422, "Enter a valid email address.");
  if (phone.length < 8) throw new HttpError(422, "Enter a valid mobile number.");
  if (password.length < 6) throw new HttpError(422, "Password must be at least 6 characters.");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new HttpError(409, "An account with that email already exists. Log in instead.");
  const passwordHash = await hashPassword(password);
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ role, name, email, phone, passwordHash, city: city || null, status: "active" })
      .returning();
    if (role === "driver") {
      const vehicleType = asString(input.vehicleType, 20);
      const vehicleModel = asString(input.vehicleModel, 80);
      const vehicleNumber = asString(input.vehicleNumber, 20).toUpperCase();
      const licenseNumber = asString(input.licenseNumber, 40).toUpperCase();
      if (!isVehicleType(vehicleType)) throw new HttpError(422, "Choose a vehicle type.");
      if (vehicleModel.length < 2 || vehicleNumber.length < 4 || licenseNumber.length < 5 || city.length < 2) {
        throw new HttpError(422, "Complete the vehicle, city and licence details.");
      }
      await tx.insert(driverProfiles).values({
        userId: created.id,
        vehicleType,
        vehicleModel,
        vehicleNumber,
        licenseNumber,
        approvalStatus: "pending",
        accessGranted: false,
        online: false,
      });
      await notifyAdmins("Driver application", `${name} applied to drive a ${vehicleType}.`, null, tx);
      await logActivity(created.id, "driver.applied", `${name} applied`, tx);
    } else {
      await logActivity(created.id, "customer.joined", name, tx);
    }
    return created;
  });
  const publicUser = await loadPublicUser(user.id);
  if (!publicUser) throw new HttpError(500, "Unable to create your account right now.");
  return publicUser;
}

export async function updateAccount(user: PublicUser, input: Record<string, unknown>) {
  const action = asString(input.action, 20) || "profile";
  if (action === "password") {
    const current = asString(input.currentPassword, 100);
    const next = asString(input.newPassword, 100);
    const confirm = asString(input.confirmPassword, 100);
    if (next.length < 8) throw new HttpError(422, "The new password must be at least 8 characters.");
    if (next !== confirm) throw new HttpError(422, "The new passwords don't match.");
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row) throw new HttpError(404, "Account not found.");
    if (!(await verifyPassword(current, row.passwordHash))) throw new HttpError(403, "The current password is incorrect.");
    await db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, user.id));
    return { message: "Password changed." };
  }
  const name = asString(input.name, 120);
  const phone = asString(input.phone, 32);
  const city = asString(input.city, 80);
  if (name.length < 2) throw new HttpError(422, "Enter your full name.");
  if (phone && phone.length < 8) throw new HttpError(422, "Enter a valid mobile number.");
  await db.update(users).set({ name, phone: phone || null, city: city || null, updatedAt: new Date() }).where(eq(users.id, user.id));
  if (user.role === "driver") {
    const vehicleModel = asString(input.vehicleModel, 80);
    const vehicleNumber = asString(input.vehicleNumber, 20).toUpperCase();
    const licenseNumber = asString(input.licenseNumber, 40).toUpperCase();
    const vehicleType = asString(input.vehicleType, 20);
    if (vehicleModel && vehicleNumber && licenseNumber && isVehicleType(vehicleType)) {
      const active = await activeRideForDriver(user.id);
      if (active && vehicleType !== user.driver?.vehicleType) {
        throw new HttpError(409, "Finish your current ride before changing vehicle category.");
      }
      await db
        .update(driverProfiles)
        .set({ vehicleModel, vehicleNumber, licenseNumber, vehicleType })
        .where(eq(driverProfiles.userId, user.id));
    }
  }
  const fresh = await loadPublicUser(user.id);
  return { message: "Profile saved.", user: fresh };
}

function countWhere<T extends { status?: string }>(rows: T[], status: string) {
  return rows.filter((row) => row.status === status).length;
}

export async function adminSnapshot(adminId: string) {
  await ensureReady();
  const legacyAdminPassword = await usesPublishedAdminPassword(adminId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [customerRows, driverRows, rideRows, paymentRows, feedbackRows, complaintRows, activity, notes, fareRates] = await Promise.all([
    db.select().from(users).where(eq(users.role, "customer")).orderBy(desc(users.createdAt)),
    db
      .select({ user: users, profile: driverProfiles })
      .from(users)
      .innerJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(eq(users.role, "driver"))
      .orderBy(desc(users.createdAt)),
    db.select().from(rides).orderBy(desc(rides.requestedAt)).limit(500),
    db.select().from(payments).orderBy(desc(payments.createdAt)).limit(500),
    db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(500),
    db.select().from(complaints).orderBy(desc(complaints.createdAt)).limit(200),
    db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(40),
    db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(40),
    getFares(),
  ]);
  const allRideCount = await db.select({ count: sql<number>`count(*)::int` }).from(rides);
  const statusCounts = await db
    .select({ status: rides.status, count: sql<number>`count(*)::int` })
    .from(rides)
    .groupBy(rides.status);
  const byStatus = Object.fromEntries(statusCounts.map((row) => [row.status, Number(row.count)]));
  const activeRides = await db
    .select()
    .from(rides)
    .where(inArray(rides.status, ACTIVE_RIDE_STATUSES))
    .orderBy(desc(rides.assignedAt));
  const people = await peopleByIds([
    ...rideRows.flatMap((ride) => [ride.customerId, ride.driverId || ""]),
    ...activeRides.flatMap((ride) => [ride.customerId, ride.driverId || ""]),
    ...paymentRows.flatMap((payment) => [payment.customerId, payment.driverId || ""]),
    ...feedbackRows.flatMap((row) => [row.customerId, row.driverId || ""]),
    ...complaintRows.flatMap((row) => [row.customerId, row.driverId || ""]),
    ...driverRows.map((row) => row.user.id),
  ]);
  const profiles = await driversByIds(driverRows.map((row) => row.user.id));
  const rideCountByCustomer = new Map<string, number>();
  const rideCountByDriver = new Map<string, number>();
  for (const ride of rideRows) {
    rideCountByCustomer.set(ride.customerId, (rideCountByCustomer.get(ride.customerId) ?? 0) + 1);
    if (ride.driverId) rideCountByDriver.set(ride.driverId, (rideCountByDriver.get(ride.driverId) ?? 0) + 1);
  }
  const activeDriverIds = new Set(activeRides.map((ride) => ride.driverId).filter(Boolean));
  const serializeAdminRide = (ride: RideRow) => ({
    ...baseRide(ride),
    customer: personBrief(people.get(ride.customerId), true),
    driver: driverBrief(ride.driverId ? people.get(ride.driverId) : undefined, ride.driverId ? profiles.get(ride.driverId) : undefined),
    payment: paymentView(ride, paymentRows.find((payment) => payment.rideId === ride.id) ?? null),
  });
  const revenue = rideRows.filter((ride) => ride.status === "COMPLETED").reduce((sum, ride) => sum + ride.fare, 0);
  const completedCount = byStatus.COMPLETED ?? 0;
  const activeCount = (byStatus.DRIVER_ASSIGNED ?? 0) + (byStatus.DRIVER_ARRIVED ?? 0) + (byStatus.IN_RIDE ?? 0);
  return {
    stats: {
      customers: customerRows.length,
      drivers: driverRows.length,
      pendingDriverVerifications: driverRows.filter((row) => row.profile.approvalStatus === "pending").length,
      rides: Number(allRideCount[0]?.count ?? rideRows.length),
      activeRides: activeCount,
      completedRides: completedCount,
      cancelledRides: byStatus.CANCELLED ?? 0,
      pendingRides: byStatus.REQUESTED ?? 0,
      onlineDrivers: driverRows.filter((row) => row.profile.online).length,
      activeDrivers: driverRows.filter((row) => row.profile.online && row.profile.approvalStatus === "approved" && row.profile.accessGranted).length,
      revenue,
      newCustomers30d: customerRows.filter((row) => row.createdAt >= since).length,
      newDrivers30d: driverRows.filter((row) => row.user.createdAt >= since).length,
      newRides30d: rideRows.filter((row) => row.requestedAt >= since).length,
      ridesByStatus: {
        REQUESTED: byStatus.REQUESTED ?? 0,
        ASSIGNED: byStatus.DRIVER_ASSIGNED ?? 0,
        ARRIVED: byStatus.DRIVER_ARRIVED ?? 0,
        IN_PROGRESS: (byStatus.DRIVER_ARRIVED ?? 0) + (byStatus.IN_RIDE ?? 0) + (byStatus.DRIVER_ASSIGNED ?? 0),
        COMPLETED: completedCount,
        CANCELLED: byStatus.CANCELLED ?? 0,
      },
    },
    customers: customerRows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      city: row.city,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      rideCount: rideCountByCustomer.get(row.id) ?? 0,
    })),
    drivers: driverRows.map(({ user, profile }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      city: user.city,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      vehicleType: profile.vehicleType,
      vehicleModel: profile.vehicleModel,
      vehicleNumber: profile.vehicleNumber,
      licenseNumber: profile.licenseNumber,
      approvalStatus: profile.approvalStatus,
      accessGranted: profile.accessGranted,
      online: profile.online,
      rating: profile.ratingCount ? Math.round((profile.ratingSum / profile.ratingCount) * 10) / 10 : null,
      ratingCount: profile.ratingCount,
      decisionNote: profile.decisionNote,
      decidedAt: profile.decidedAt?.toISOString() ?? null,
      lat: profile.lat,
      lng: profile.lng,
      locationUpdatedAt: profile.locationUpdatedAt?.toISOString() ?? null,
      rideCount: rideCountByDriver.get(user.id) ?? 0,
      hasActiveRide: activeDriverIds.has(user.id),
      earnings: rideRows.filter((ride) => ride.driverId === user.id && ride.status === "COMPLETED").reduce((sum, ride) => sum + ride.fare, 0),
    })),
    rides: rideRows.map(serializeAdminRide),
    liveRides: activeRides.map(serializeAdminRide),
    payments: paymentRows.map((payment) => {
      const ride = rideRows.find((row) => row.id === payment.rideId);
      return {
        id: payment.id,
        rideId: payment.rideId,
        code: ride?.code ?? payment.reference,
        customer: personBrief(people.get(payment.customerId), true),
        driver: personBrief(payment.driverId ? people.get(payment.driverId) : undefined, true),
        method: payment.method,
        methodLabel: methodLabel(payment.method),
        amount: payment.amount,
        status: payment.status,
        reference: payment.reference,
        note: payment.note,
        createdAt: payment.createdAt.toISOString(),
        confirmedAt: payment.confirmedAt?.toISOString() ?? null,
        rideStatus: ride?.status ?? null,
        demo: payment.method === "demo",
      };
    }),
    feedback: feedbackRows.map((row) => ({
      id: row.id,
      rideId: row.rideId,
      code: rideRows.find((ride) => ride.id === row.rideId)?.code ?? null,
      customer: personBrief(people.get(row.customerId), true),
      driver: personBrief(row.driverId ? people.get(row.driverId) : undefined, true),
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      pickup: rideRows.find((ride) => ride.id === row.rideId)?.pickup ?? null,
      destination: rideRows.find((ride) => ride.id === row.rideId)?.destination ?? null,
    })),
    complaints: complaintRows.map((row) => ({
      id: row.id,
      rideId: row.rideId,
      code: rideRows.find((ride) => ride.id === row.rideId)?.code ?? null,
      customer: personBrief(people.get(row.customerId), true),
      driver: personBrief(row.driverId ? people.get(row.driverId) : undefined, true),
      description: row.description,
      status: row.status,
      resolution: row.resolution,
      createdAt: row.createdAt.toISOString(),
    })),
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    })),
    notifications: notes.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
      rideId: row.rideId,
    })),
    fares: fareRates,
    cars: CARS,
    warnings: { legacyAdminPassword },
  };
}

// ---------------------------------------------------------------------------------------------
// Admin live tracking
// ---------------------------------------------------------------------------------------------
type DispatchCode = "eligible" | "on_trip" | "offline" | "unreachable" | "revoked" | "pending" | "rejected" | "suspended";

// The single rule for "can this driver be sent / accept ride requests right now?". The dispatcher
// (eligibleDrivers) enforces the same conditions in SQL; the admin screen shows this result, so what
// the admin sees is what dispatch does.
function dispatchStatus(
  input: { accountStatus: string; approvalStatus: string; accessGranted: boolean; online: boolean; lastSeenAt: Date | null; onTrip: boolean },
  now: number,
): { code: DispatchCode; eligible: boolean } {
  const result = (code: DispatchCode) => ({ code, eligible: code === "eligible" });
  if (input.accountStatus !== "active") return result("suspended");
  if (input.approvalStatus === "rejected") return result("rejected");
  if (input.approvalStatus !== "approved") return result("pending");
  if (!input.accessGranted) return result("revoked");
  if (!input.online) return result("offline");
  if (!input.lastSeenAt || now - input.lastSeenAt.getTime() > PRESENCE_MS) return result("unreachable");
  if (input.onTrip) return result("on_trip");
  return result("eligible");
}

export async function adminLiveSnapshot() {
  await ensureReady();
  const now = Date.now();
  const [driverRows, openRides] = await Promise.all([
    db.select({ user: users, profile: driverProfiles }).from(users).innerJoin(driverProfiles, eq(driverProfiles.userId, users.id)).where(eq(users.role, "driver")),
    db.select().from(rides).where(inArray(rides.status, OPEN_RIDE_STATUSES)).orderBy(desc(rides.requestedAt)),
  ]);
  const people = await peopleByIds(openRides.map((ride) => ride.customerId));
  const waitingIds = openRides.filter((ride) => ride.status === "REQUESTED").map((ride) => ride.id);
  const offerRows = waitingIds.length
    ? await db
        .select({ rideId: rideOffers.rideId, status: rideOffers.status, n: sql<number>`count(*)::int` })
        .from(rideOffers)
        .where(inArray(rideOffers.rideId, waitingIds))
        .groupBy(rideOffers.rideId, rideOffers.status)
    : [];
  const profileOf = new Map(driverRows.map((row) => [row.user.id, row]));
  const activeByDriver = new Map<string, RideRow>();
  for (const ride of openRides) {
    if (ride.driverId && ACTIVE_RIDE_STATUSES.includes(ride.status as RideStatus)) activeByDriver.set(ride.driverId, ride);
  }

  const drivers = driverRows.map(({ user, profile }) => {
    const active = activeByDriver.get(user.id) ?? null;
    const dispatch = dispatchStatus(
      { accountStatus: user.status, approvalStatus: profile.approvalStatus, accessGranted: profile.accessGranted, online: profile.online, lastSeenAt: profile.lastSeenAt, onTrip: !!active },
      now,
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      city: user.city,
      accountStatus: user.status,
      vehicleType: profile.vehicleType,
      vehicleModel: profile.vehicleModel,
      vehicleNumber: profile.vehicleNumber,
      approvalStatus: profile.approvalStatus,
      accessGranted: profile.accessGranted,
      decisionNote: profile.decisionNote,
      online: profile.online,
      eligible: dispatch.eligible,
      dispatch: dispatch.code,
      lastSeenAt: profile.lastSeenAt?.toISOString() ?? null,
      gpsState: profile.gpsState,
      lat: profile.lat,
      lng: profile.lng,
      locationUpdatedAt: profile.locationUpdatedAt?.toISOString() ?? null,
      activeRide: active ? { id: active.id, code: active.code, status: active.status } : null,
    };
  });
  const rank = (d: { online: boolean; approvalStatus: string }) => (d.online ? 0 : d.approvalStatus === "approved" ? 1 : 2);
  drivers.sort((a, b) => rank(a) - rank(b) || (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || a.name.localeCompare(b.name));

  const ridePayload = (ride: RideRow) => {
    const customer = people.get(ride.customerId);
    const driver = ride.driverId ? profileOf.get(ride.driverId) : undefined;
    return {
      id: ride.id,
      code: ride.code,
      status: ride.status,
      vehicleType: ride.vehicleType,
      pickup: ride.pickup,
      pickupLat: ride.pickupLat,
      pickupLng: ride.pickupLng,
      destination: ride.destination,
      destinationLat: ride.destinationLat,
      destinationLng: ride.destinationLng,
      route: ride.route ?? [],
      fare: ride.fare,
      distanceKm: ride.distanceKm,
      durationMin: ride.durationMin,
      requestedAt: ride.requestedAt.toISOString(),
      assignedAt: ride.assignedAt?.toISOString() ?? null,
      paymentMethod: ride.paymentMethod,
      customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
      driver: driver
        ? { id: driver.user.id, name: driver.user.name, phone: driver.user.phone, vehicleModel: driver.profile.vehicleModel, vehicleNumber: driver.profile.vehicleNumber }
        : null,
      driverLat: ride.driverLat,
      driverLng: ride.driverLng,
      driverSeenAt: ride.driverSeenAt?.toISOString() ?? null,
      offered: offerRows.filter((row) => row.rideId === ride.id && row.status === "offered").reduce((sum, row) => sum + Number(row.n), 0),
      declined: offerRows.filter((row) => row.rideId === ride.id && row.status === "rejected").reduce((sum, row) => sum + Number(row.n), 0),
    };
  };
  const activeRides = openRides.filter((ride) => ride.status !== "REQUESTED").map(ridePayload);
  const waitingRides = openRides.filter((ride) => ride.status === "REQUESTED").map(ridePayload);

  return {
    serverTime: new Date(now).toISOString(),
    presenceSeconds: PRESENCE_MS / 1000,
    staleSeconds: STALE_LOCATION_MS / 1000,
    stats: {
      drivers: drivers.length,
      online: drivers.filter((d) => d.online).length,
      eligible: drivers.filter((d) => d.eligible).length,
      onTrip: drivers.filter((d) => d.dispatch === "on_trip").length,
      activeRides: activeRides.length,
      waitingRides: waitingRides.length,
    },
    drivers,
    activeRides,
    waitingRides,
  };
}

function baseRide(ride: RideRow) {
  return {
    id: ride.id,
    code: ride.code,
    status: ride.status,
    pickup: ride.pickup,
    pickupLat: ride.pickupLat,
    pickupLng: ride.pickupLng,
    destination: ride.destination,
    destinationLat: ride.destinationLat,
    destinationLng: ride.destinationLng,
    vehicleType: ride.vehicleType,
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    fare: ride.fare,
    route: ride.route ?? [],
    paymentStatus: ride.paymentStatus,
    paymentMethod: ride.paymentMethod,
    paymentReference: ride.paymentReference,
    customerRating: ride.customerRating,
    customerFeedback: ride.customerFeedback,
    requestedAt: ride.requestedAt.toISOString(),
    assignedAt: ride.assignedAt?.toISOString() ?? null,
    arrivedAt: ride.arrivedAt?.toISOString() ?? null,
    startedAt: ride.startedAt?.toISOString() ?? null,
    completedAt: ride.completedAt?.toISOString() ?? null,
    cancelledAt: ride.cancelledAt?.toISOString() ?? null,
    driverLat: ride.driverLat,
    driverLng: ride.driverLng,
    driverSeenAt: ride.driverSeenAt?.toISOString() ?? null,
    customerLat: ride.customerLat,
    customerLng: ride.customerLng,
    customerSeenAt: ride.customerSeenAt?.toISOString() ?? null,
  };
}

export async function adminAction(admin: PublicUser, input: Record<string, unknown>) {
  const action = asString(input.action, 40);
  const id = asString(input.id, 80);
  if (!id) throw new HttpError(400, "Choose a record first.");
  if (action === "approve" || action === "reject" || action === "revoke" || action === "grant" || action === "withdraw" || action === "setOnline") {
    return adminDriverAction(admin, action, id, input);
  }
  if (action === "suspend" || action === "activate") return adminCustomerAction(admin, action, id);
  if (action === "assignDriver" || action === "cancelRide" || action === "markArrived" || action === "startTrip" || action === "completeTrip") {
    return adminRideAction(admin, action, id, input);
  }
  if (action === "updateComplaint") return adminComplaint(admin, id, input);
  throw new HttpError(400, "That action is not available.");
}

async function adminDriverAction(admin: PublicUser, action: string, id: string, input: Record<string, unknown>) {
  const [row] = await db
    .select({ user: users, profile: driverProfiles })
    .from(users)
    .innerJoin(driverProfiles, eq(driverProfiles.userId, users.id))
    .where(eq(users.id, id))
    .limit(1);
  if (!row || row.user.role !== "driver") throw new HttpError(404, "Driver not found.");
  const reason = asString(input.reason, 300);
  if (action === "approve") {
    await db
      .update(driverProfiles)
      .set({ approvalStatus: "approved", accessGranted: true, decisionNote: null, decidedAt: new Date() })
      .where(eq(driverProfiles.userId, id));
    await notify(id, "Application approved", "You can go online and receive ride requests.");
    await logActivity(admin.id, "driver.approved", row.user.name, db);
    return { message: `${row.user.name} is approved and can go online.` };
  }
  if (action === "reject") {
    await forceOfflineAndMaybeReassign(id, row.user.name);
    await db
      .update(driverProfiles)
      .set({ approvalStatus: "rejected", accessGranted: false, online: false, decisionNote: reason || "Application not approved", decidedAt: new Date() })
      .where(eq(driverProfiles.userId, id));
    await notify(id, "Application not approved", reason || "A RideX admin did not approve this application.");
    await logActivity(admin.id, "driver.rejected", row.user.name, db);
    return { message: `${row.user.name} was rejected.` };
  }
  if (action === "withdraw" || action === "revoke") {
    await forceOfflineAndMaybeReassign(id, row.user.name);
    if (action === "withdraw") {
      await db
        .update(driverProfiles)
        .set({ approvalStatus: "pending", accessGranted: false, online: false, decisionNote: reason || "Approval withdrawn", decidedAt: new Date() })
        .where(eq(driverProfiles.userId, id));
      await notify(id, "Approval withdrawn", "Your application is pending review again. Online access is off.");
      await logActivity(admin.id, "driver.withdrawn", row.user.name, db);
      return { message: `Approval withdrawn for ${row.user.name}.` };
    }
    await db
      .update(driverProfiles)
      .set({ accessGranted: false, online: false, decisionNote: reason || "Online access revoked", decidedAt: new Date() })
      .where(eq(driverProfiles.userId, id));
    await notify(id, "Access revoked", "An administrator revoked your online access. You cannot accept rides until it is granted again.");
    await logActivity(admin.id, "driver.revoked", row.user.name, db);
    return { message: `Online access revoked for ${row.user.name}.` };
  }
  if (action === "grant") {
    if (row.profile.approvalStatus !== "approved") throw new HttpError(409, "Approve this driver before granting access.");
    await db.update(driverProfiles).set({ accessGranted: true, decisionNote: null }).where(eq(driverProfiles.userId, id));
    await notify(id, "Access granted", "You can go online and receive ride requests.");
    await logActivity(admin.id, "driver.access_granted", row.user.name, db);
    return { message: `Access granted for ${row.user.name}.` };
  }
  const online = Boolean(input.online);
  if (online && (row.profile.approvalStatus !== "approved" || !row.profile.accessGranted)) {
    throw new HttpError(409, "Approve this driver and grant access before they can go online.");
  }
  if (!online) await forceOfflineAndMaybeReassign(id, row.user.name);
  await db.update(driverProfiles).set({ online }).where(eq(driverProfiles.userId, id));
  await logActivity(admin.id, online ? "driver.forced_online" : "driver.forced_offline", row.user.name, db);
  return { message: online ? `${row.user.name} is online.` : `${row.user.name} is offline.` };
}

async function forceOfflineAndMaybeReassign(driverId: string, name: string) {
  const active = await activeRideForDriver(driverId);
  if (active?.status === "IN_RIDE") {
    throw new HttpError(409, `${name} has a trip in progress. Complete or cancel that ride before changing access.`);
  }
  if (active) {
    await db
      .update(rides)
      .set({ status: "REQUESTED", driverId: null, assignedAt: null, arrivedAt: null, driverLat: null, driverLng: null, driverSeenAt: null })
      .where(eq(rides.id, active.id));
    await db
      .insert(rideOffers)
      .values({ rideId: active.id, driverId, status: "rejected" })
      .onConflictDoUpdate({ target: [rideOffers.rideId, rideOffers.driverId], set: { status: "rejected" } });
    const [fresh] = await db.select().from(rides).where(eq(rides.id, active.id)).limit(1);
    if (fresh) {
      await notify(fresh.customerId, "Looking for another driver", `${fresh.code} is being offered to another driver.`);
      await offerToDrivers(fresh, [driverId]);
    }
  }
  await db.update(driverProfiles).set({ online: false }).where(eq(driverProfiles.userId, driverId));
}

async function adminCustomerAction(admin: PublicUser, action: string, id: string) {
  const [customer] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!customer || customer.role !== "customer") throw new HttpError(404, "Customer not found.");
  const status = action === "suspend" ? "suspended" : "active";
  await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
  if (status === "suspended") await db.delete(sessions).where(eq(sessions.userId, id));
  await notify(id, status === "suspended" ? "Account suspended" : "Account reactivated", status === "suspended" ? "You cannot book rides until an administrator reactivates the account." : "Your RideX account is active again.");
  await logActivity(admin.id, `customer.${status}`, customer.name, db);
  return { message: status === "suspended" ? `${customer.name} is suspended.` : `${customer.name}'s account is active again.` };
}

async function adminRideAction(admin: PublicUser, action: string, id: string, input: Record<string, unknown>) {
  const ride = await loadRide(id);
  if (action === "cancelRide") {
    if (ride.status === "COMPLETED" || ride.status === "CANCELLED") throw new HttpError(409, "This ride is already finished.");
    const [saved] = await db
      .update(rides)
      .set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: asString(input.reason, 300) || "Cancelled by admin" })
      .where(eq(rides.id, id))
      .returning();
    await notify(ride.customerId, "Ride cancelled", `${ride.code} was cancelled by RideX.`, ride.id);
    if (ride.driverId) await notify(ride.driverId, "Ride cancelled", `${ride.code} was cancelled by RideX.`, ride.id);
    await logActivity(admin.id, "ride.admin_cancelled", ride.code, db);
    return { message: `${ride.code} cancelled.`, ride: saved };
  }
  if (action === "assignDriver") {
    const driverId = asString(input.driverId, 80);
    if (ride.status !== "REQUESTED") throw new HttpError(409, "Only open requests can be assigned.");
    const [driver] = await db
      .select({ user: users, profile: driverProfiles })
      .from(users)
      .innerJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(eq(users.id, driverId))
      .limit(1);
    if (!driver) throw new HttpError(404, "Driver not found.");
    if (driver.profile.approvalStatus !== "approved" || !driver.profile.accessGranted || !driver.profile.online) {
      throw new HttpError(409, "Choose an approved, online driver with access granted.");
    }
    const active = await activeRideForDriver(driverId);
    if (active) throw new HttpError(409, "That driver already has an active ride.");
    const [saved] = await db
      .update(rides)
      .set({ driverId, status: "DRIVER_ASSIGNED", assignedAt: new Date() })
      .where(and(eq(rides.id, id), eq(rides.status, "REQUESTED"), isNull(rides.driverId)))
      .returning();
    if (!saved) throw new HttpError(409, "Another driver already accepted this ride.");
    await notify(ride.customerId, "Driver assigned", `${driver.user.name} was assigned to ${ride.code}.`, ride.id);
    await notify(driverId, "Ride assigned", `RideX assigned ${ride.code} to you.`, ride.id);
    await logActivity(admin.id, "ride.assigned", `${ride.code} assigned to ${driver.user.name}`, db);
    return { message: `${driver.user.name} assigned to ${ride.code}.` };
  }
  const map: Record<string, { from: RideStatus; to: RideStatus; title: string }> = {
    markArrived: { from: "DRIVER_ASSIGNED", to: "DRIVER_ARRIVED", title: "Driver arrived" },
    startTrip: { from: "DRIVER_ARRIVED", to: "IN_RIDE", title: "Ride started" },
    completeTrip: { from: "IN_RIDE", to: "COMPLETED", title: "Ride completed" },
  };
  const step = map[action];
  if (!step) throw new HttpError(400, "That action is not available.");
  if (ride.status !== step.from) throw new HttpError(409, "That status change is not valid for this ride.");
  const now = new Date();
  const [saved] = await db
    .update(rides)
    .set({
      status: step.to,
      arrivedAt: step.to === "DRIVER_ARRIVED" ? now : ride.arrivedAt,
      startedAt: step.to === "IN_RIDE" ? now : ride.startedAt,
      completedAt: step.to === "COMPLETED" ? now : ride.completedAt,
    })
    .where(and(eq(rides.id, id), eq(rides.status, step.from)))
    .returning();
  if (!saved) throw new HttpError(409, "The ride status changed before that action could be saved.");
  await notify(ride.customerId, step.title, `${ride.code} is now ${step.to.replaceAll("_", " ").toLowerCase()}.`, ride.id);
  if (ride.driverId) await notify(ride.driverId, step.title, `${ride.code} was updated by RideX.`, ride.id);
  await logActivity(admin.id, `ride.admin_${step.to.toLowerCase()}`, ride.code, db);
  return { message: `${ride.code}: ${step.title}.` };
}

async function adminComplaint(admin: PublicUser, id: string, input: Record<string, unknown>) {
  const status = asString(input.status, 20);
  const resolution = asString(input.resolution, 1000);
  if (!["OPEN", "IN_REVIEW", "RESOLVED"].includes(status)) throw new HttpError(422, "Choose a valid complaint status.");
  if (status === "RESOLVED" && resolution.length < 3) throw new HttpError(422, "Add resolution notes before marking this complaint resolved.");
  const [row] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Complaint not found.");
  await db.update(complaints).set({ status, resolution: resolution || row.resolution, updatedAt: new Date() }).where(eq(complaints.id, id));
  await notify(row.customerId, "Complaint updated", `Your complaint is now ${status.replaceAll("_", " ").toLowerCase()}.`);
  await logActivity(admin.id, "complaint.updated", `${row.id} ${status}`, db);
  return { message: "Complaint updated." };
}

export async function listNotifications(userId: string) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(30);
  return {
    notifications: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      rideId: row.rideId,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
    })),
    unread: rows.filter((row) => !row.read).length,
  };
}

export async function markNotifications(userId: string, input: Record<string, unknown>) {
  if (input.all === true) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
    return { ok: true };
  }
  const id = asString(input.id, 80);
  if (!id) throw new HttpError(400, "Choose a notification.");
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  return { ok: true };
}

export async function accountPayments(user: PublicUser) {
  const rows =
    user.role === "driver"
      ? await db.select().from(payments).where(eq(payments.driverId, user.id)).orderBy(desc(payments.createdAt))
      : await db.select().from(payments).where(eq(payments.customerId, user.id)).orderBy(desc(payments.createdAt));
  const rideIds = rows.map((row) => row.rideId);
  const rideRows = rideIds.length ? await db.select().from(rides).where(inArray(rides.id, rideIds)) : [];
  const rideMap = new Map(rideRows.map((ride) => [ride.id, ride]));
  return rows.map((payment) => ({
    id: payment.id,
    rideId: payment.rideId,
    code: rideMap.get(payment.rideId)?.code ?? payment.reference,
    method: payment.method,
    methodLabel: methodLabel(payment.method),
    amount: payment.amount,
    status: payment.status,
    reference: payment.reference,
    note: payment.note,
    createdAt: payment.createdAt.toISOString(),
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
    demo: payment.method === "demo",
    message: paymentPresentation({ role: user.role === "driver" ? "driver" : "customer", rideStatus: rideMap.get(payment.rideId)?.status, status: payment.status, method: payment.method }).title,
  }));
}

export function quoteFare(distanceKm: number, rates: Record<VehicleType, number>, vehicleType: string) {
  const type = isVehicleType(vehicleType) ? vehicleType : "sedan";
  return fareFor(distanceKm, rates[type]);
}

export { countWhere };
