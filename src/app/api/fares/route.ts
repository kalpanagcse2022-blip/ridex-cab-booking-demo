import { errorResponse, json } from "@/lib/http";
import { getFares } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ rates: await getFares() });
  } catch (error) {
    return errorResponse(error);
  }
}
