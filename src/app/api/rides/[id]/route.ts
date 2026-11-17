import { requireUser } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { getRide, updateLocation } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireUser(request);
    return json({ ride: await getRide(user, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireUser(request);
    return json(await updateLocation(user, id, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
