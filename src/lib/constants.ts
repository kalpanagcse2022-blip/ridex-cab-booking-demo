export const CARS = [
  { id: "mini", name: "RideX Mini", note: "Everyday city trips", rate: 12 },
  { id: "sedan", name: "RideX Sedan", note: "Extra comfort, more room", rate: 18 },
  { id: "suv", name: "RideX SUV", note: "Families & luggage", rate: 24 },
] as const;

export type VehicleType = (typeof CARS)[number]["id"];
export type Role = "customer" | "driver" | "admin";
export type RideStatus =
  | "REQUESTED"
  | "DRIVER_ASSIGNED"
  | "DRIVER_ARRIVED"
  | "IN_RIDE"
  | "COMPLETED"
  | "CANCELLED";
export type PaymentMethod = "cash" | "demo";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED";

export const ACTIVE_RIDE_STATUSES: RideStatus[] = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_RIDE"];
export const OPEN_RIDE_STATUSES: RideStatus[] = ["REQUESTED", ...ACTIVE_RIDE_STATUSES];
export const STALE_LOCATION_MS = 90_000;
/**
 * How recently a driver's app must have contacted RideX for the driver to count as reachable.
 * The driver dashboard refreshes every ~5 s while it is open, so a driver who is flagged online
 * but has been silent for longer than this (browser closed, phone offline) is not sent requests.
 */
export const PRESENCE_MS = 120_000;
/** What a driver's own device reports about GPS, sent with the dashboard refresh. */
export const DRIVER_GPS_STATES = ["off", "waiting", "sharing", "denied", "unavailable"] as const;

export const STATUS_LABEL: Record<RideStatus, string> = {
  REQUESTED: "Finding your driver",
  DRIVER_ASSIGNED: "Driver assigned",
  DRIVER_ARRIVED: "Driver has arrived",
  IN_RIDE: "On the way",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function carFor(id: string | null | undefined) {
  return CARS.find((car) => car.id === id) ?? CARS[1];
}

export function isVehicleType(value: string): value is VehicleType {
  return CARS.some((car) => car.id === value);
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

/* ------------------------------------------------------------------------------------------
 * Payment wording. ONE function decides what a payment looks like and says, and the server,
 * the customer pages, the driver dashboard and the admin pages all use it, so the same
 * backend state can never read differently on different screens.
 *
 * Success is shown ONLY when the backend status is PAID. Nothing else is ever styled as a
 * success. This project's online payment is a simulation; the note says so in plain words and
 * never claims that real money moved.
 * ---------------------------------------------------------------------------------------- */
export type PaymentTone = "success" | "pending" | "neutral" | "danger";
export type PaymentRole = "customer" | "driver" | "admin";

export type PaymentPresentation = {
  tone: PaymentTone;
  paid: boolean;
  title: string;
  subtitle: string;
  note: string | null;
};

const DEMO_NOTE_PAID = "Demo payment — simulated inside RideX. No real money was transferred.";
const DEMO_NOTE_OPEN = "Online checkout is a demo — no real money is transferred.";
const CASH_NOTE = "Cash is paid in person — nothing is charged online.";

export function paymentPresentation(input: {
  role: PaymentRole;
  rideStatus: string | null | undefined;
  status: string | null | undefined;
  method: string | null | undefined;
}): PaymentPresentation {
  const { role } = input;
  const status = input.status ?? "UNPAID";
  const method = input.method ?? null;
  const rideStatus = input.rideStatus ?? "";

  if (status === "PAID") {
    const title = role === "driver" ? "Payment Received" : "Payment Successful";
    if (method === "demo") {
      return { tone: "success", paid: true, title, subtitle: "Amount successfully credited", note: DEMO_NOTE_PAID };
    }
    const subtitle =
      role === "customer" ? "Cash handed to your driver and confirmed" : "Cash received and confirmed by the driver";
    return { tone: "success", paid: true, title, subtitle, note: CASH_NOTE };
  }

  if (status === "FAILED") {
    return {
      tone: "danger",
      paid: false,
      title: "Payment failed",
      subtitle: "No payment is recorded for this trip.",
      note: method === "demo" ? DEMO_NOTE_OPEN : null,
    };
  }

  if (rideStatus === "CANCELLED") {
    return { tone: "neutral", paid: false, title: "No charge", subtitle: "Cancelled rides are not charged.", note: null };
  }

  if (status === "PENDING" && method === "cash") {
    const subtitle =
      role === "customer"
        ? "Cash selected — waiting for your driver to confirm it."
        : role === "driver"
          ? "Rider chose cash — confirm once you have received it."
          : "Cash selected — waiting for the driver to confirm.";
    return { tone: "pending", paid: false, title: "Payment pending", subtitle, note: CASH_NOTE };
  }

  if (rideStatus === "COMPLETED") {
    const subtitle =
      role === "customer"
        ? "Choose how you'd like to pay below."
        : role === "driver"
          ? method === "cash"
            ? "Rider pays by cash — confirm once you have received it."
            : "Waiting for the rider to pay."
          : "Waiting for the rider to pay.";
    return {
      tone: "pending",
      paid: false,
      title: "Payment pending",
      subtitle,
      note: method === "cash" ? CASH_NOTE : DEMO_NOTE_OPEN,
    };
  }

  return {
    tone: "neutral",
    paid: false,
    title: "Not charged yet",
    subtitle: "Payment opens after the ride is completed.",
    note: null,
  };
}

/** Older call shape, kept so the server's ride payload keeps its existing field names. */
export function paymentCopy(input: {
  rideStatus: string;
  paymentStatus: string | null | undefined;
  method: string | null | undefined;
}) {
  const base = { rideStatus: input.rideStatus, status: input.paymentStatus, method: input.method };
  const customer = paymentPresentation({ role: "customer", ...base });
  const driver = paymentPresentation({ role: "driver", ...base });
  const admin = paymentPresentation({ role: "admin", ...base });
  return {
    customer: customer.title,
    customerDetail: customer.subtitle,
    driver: driver.title,
    driverDetail: driver.subtitle,
    admin: admin.title,
    notice: customer.note ?? "",
    tone: customer.tone,
    paid: customer.paid,
  };
}

export function methodLabel(method: string | null | undefined) {
  if (method === "demo") return "Online (demo)";
  if (method === "cash") return "Cash";
  return "Not chosen";
}

export function positionState(seenAt: string | Date | null | undefined, now = Date.now()) {
  if (!seenAt) return "none" as const;
  const time = new Date(seenAt).getTime();
  if (!Number.isFinite(time)) return "none" as const;
  return now - time < STALE_LOCATION_MS ? ("live" as const) : ("stale" as const);
}

/* ------------------------------------------------------------------------------------------
 * Customer ride stages. The stage is worked out from what the backend actually reports:
 * the ride's status, how many drivers the request has really been offered to / declined by,
 * and whether the assigned driver has a live GPS fix. Nothing here is a fixed script.
 * ---------------------------------------------------------------------------------------- */
export type StageTone = "slate" | "amber" | "blue" | "orange" | "violet" | "navy" | "green" | "red";
export type StageIcon = "send" | "clock" | "userCheck" | "navigation" | "mapPin" | "car" | "flag" | "xCircle";
export type StageKey = "request-sent" | "waiting" | "accepted" | "arriving" | "arrived" | "in-progress" | "completed" | "cancelled";

export type RideStage = {
  key: StageKey;
  title: string;
  subtitle: string;
  tone: StageTone;
  icon: StageIcon;
  /** index of the current stage in `labels` (-1 when the ride was cancelled) */
  step: number;
  labels: string[];
  cancelled: boolean;
};

export const STAGE_LABELS = ["Request Sent", "Waiting for Driver", "Driver Accepted", "Driver Arriving", "Ride in Progress", "Ride Completed"];

export function rideStage(input: {
  status: string;
  notified?: number | null;
  declined?: number | null;
  driverName?: string | null;
  driverLive?: boolean;
}): RideStage {
  const labels = [...STAGE_LABELS];
  const driver = input.driverName?.trim() || "Your driver";
  const notified = input.notified ?? 0;
  const declined = input.declined ?? 0;

  switch (input.status) {
    case "REQUESTED":
      if (notified > 0) {
        return {
          key: "waiting",
          title: "Waiting for Driver",
          subtitle: `Sent to ${notified} nearby driver${notified === 1 ? "" : "s"}. You'll be notified the moment one accepts.`,
          tone: "amber",
          icon: "clock",
          step: 1,
          labels,
          cancelled: false,
        };
      }
      return {
        key: "request-sent",
        title: "Request Sent",
        subtitle:
          declined > 0
            ? "Nearby drivers declined this request. It stays open for the next driver who comes online."
            : "Your request is saved. No driver in this vehicle category is online right now — it stays open until one is.",
        tone: "slate",
        icon: "send",
        step: 0,
        labels,
        cancelled: false,
      };
    case "DRIVER_ASSIGNED":
      if (input.driverLive) {
        return {
          key: "arriving",
          title: "Driver Arriving",
          subtitle: `${driver} is on the way to your pickup point.`,
          tone: "orange",
          icon: "navigation",
          step: 3,
          labels,
          cancelled: false,
        };
      }
      return {
        key: "accepted",
        title: "Driver Accepted",
        subtitle: `${driver} accepted your ride. Live location appears as soon as their GPS reports.`,
        tone: "blue",
        icon: "userCheck",
        step: 2,
        labels,
        cancelled: false,
      };
    case "DRIVER_ARRIVED":
      labels[3] = "Driver Arrived";
      return {
        key: "arrived",
        title: "Driver Arrived",
        subtitle: `${driver} is waiting at your pickup point.`,
        tone: "violet",
        icon: "mapPin",
        step: 3,
        labels,
        cancelled: false,
      };
    case "IN_RIDE":
      return {
        key: "in-progress",
        title: "Ride in Progress",
        subtitle: "You're on your way to the destination.",
        tone: "navy",
        icon: "car",
        step: 4,
        labels,
        cancelled: false,
      };
    case "COMPLETED":
      return {
        key: "completed",
        title: "Ride Completed",
        subtitle: "Thanks for riding with RideX.",
        tone: "green",
        icon: "flag",
        step: 5,
        labels,
        cancelled: false,
      };
    case "CANCELLED":
      return {
        key: "cancelled",
        title: "Ride Cancelled",
        subtitle: "This ride was cancelled and live tracking has stopped. You were not charged.",
        tone: "red",
        icon: "xCircle",
        step: -1,
        labels,
        cancelled: true,
      };
    default:
      return { key: "request-sent", title: "Ride", subtitle: "", tone: "slate", icon: "send", step: 0, labels, cancelled: false };
  }
}

/** Colour family for a ride status, shared by every list and table. */
export function statusTone(status: string): StageTone {
  switch (status) {
    case "REQUESTED":
      return "amber";
    case "DRIVER_ASSIGNED":
      return "blue";
    case "DRIVER_ARRIVED":
      return "violet";
    case "IN_RIDE":
      return "navy";
    case "COMPLETED":
      return "green";
    case "CANCELLED":
      return "red";
    default:
      return "slate";
  }
}
