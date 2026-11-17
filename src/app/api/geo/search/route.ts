import { searchPlaces } from "@/lib/geo";
import { errorResponse, json, asString } from "@/lib/http";
import { ensureReady } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureReady();
    const query = asString(new URL(request.url).searchParams.get("q"), 160);
    if (query.length < 3) return json({ results: [] });
    const results = await searchPlaces(query);
    return json({
      results,
      error: results.length ? null : "No matching places. Try a more specific name.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
