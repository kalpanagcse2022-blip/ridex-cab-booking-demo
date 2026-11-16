import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"),
    city: text("city"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const driverProfiles = pgTable("driver_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  vehicleType: text("vehicle_type").notNull(),
  vehicleModel: text("vehicle_model").notNull(),
  vehicleNumber: text("vehicle_number").notNull(),
  licenseNumber: text("license_number").notNull(),
  approvalStatus: text("approval_status").notNull().default("pending"),
  accessGranted: boolean("access_granted").notNull().default(false),
  online: boolean("online").notNull().default(false),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
  ratingSum: integer("rating_sum").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  // Last time the driver's app contacted the server (dashboard refresh, GPS fix, going online/offline).
  // Nullable and additive: rows that existed before this column simply have no value yet.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // What the driver's own device reports about GPS: off | waiting | sharing | denied | unavailable.
  gpsState: text("gps_state"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash)],
);

export const rides = pgTable(
  "rides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    driverId: uuid("driver_id").references(() => users.id),
    status: text("status").notNull().default("REQUESTED"),
    pickup: text("pickup").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLng: doublePrecision("pickup_lng").notNull(),
    destination: text("destination").notNull(),
    destinationLat: doublePrecision("destination_lat").notNull(),
    destinationLng: doublePrecision("destination_lng").notNull(),
    vehicleType: text("vehicle_type").notNull(),
    distanceKm: doublePrecision("distance_km").notNull(),
    durationMin: integer("duration_min").notNull(),
    fare: integer("fare").notNull(),
    route: jsonb("route").$type<[number, number][]>(),
    paymentMethod: text("payment_method"),
    paymentStatus: text("payment_status").notNull().default("UNPAID"),
    paymentReference: text("payment_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    customerRating: integer("customer_rating"),
    customerFeedback: text("customer_feedback"),
    cancelReason: text("cancel_reason"),
    idempotencyKey: text("idempotency_key"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    customerLat: doublePrecision("customer_lat"),
    customerLng: doublePrecision("customer_lng"),
    customerSeenAt: timestamp("customer_seen_at", { withTimezone: true }),
    driverLat: doublePrecision("driver_lat"),
    driverLng: doublePrecision("driver_lng"),
    driverSeenAt: timestamp("driver_seen_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("rides_code_unique").on(table.code),
    uniqueIndex("rides_idempotency_unique").on(table.idempotencyKey),
    index("rides_customer_idx").on(table.customerId),
    index("rides_driver_idx").on(table.driverId),
    index("rides_status_idx").on(table.status),
  ],
);

export const rideOffers = pgTable(
  "ride_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("offered"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ride_offers_ride_driver_unique").on(table.rideId, table.driverId)],
);

export const locationUpdates = pgTable(
  "location_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracy: doublePrecision("accuracy"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("location_updates_ride_idx").on(table.rideId, table.recordedAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    rideId: uuid("ride_id"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    driverId: uuid("driver_id").references(() => users.id),
    method: text("method").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull(),
    reference: text("reference").notNull(),
    note: text("note"),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("payments_ride_unique").on(table.rideId)],
);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    driverId: uuid("driver_id").references(() => users.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("feedback_ride_unique").on(table.rideId)],
);

export const complaints = pgTable("complaints", {
  id: uuid("id").primaryKey().defaultRandom(),
  rideId: uuid("ride_id").references(() => rides.id, { onDelete: "set null" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => users.id),
  driverId: uuid("driver_id").references(() => users.id),
  description: text("description").notNull(),
  status: text("status").notNull().default("OPEN"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
