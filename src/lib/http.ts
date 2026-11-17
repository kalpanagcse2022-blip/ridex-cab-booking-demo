export class HttpError extends Error {
  status: number;
  /** Optional machine-readable detail sent alongside the message (e.g. which ride is blocking a booking). */
  data?: Record<string, unknown>;

  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    // `error` always wins, so extra detail can never overwrite the message.
    return json({ ...error.data, error: error.message }, error.status);
  }
  console.error(error);
  return json({ error: "Unable to reach RideX right now." }, 500);
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "The request body could not be read.");
  }
}

export function asString(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function asNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isCoord(lat: number | null, lng: number | null) {
  return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
