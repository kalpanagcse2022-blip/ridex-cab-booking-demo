import { requireUser } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { listNotifications, markNotifications } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json(await listNotifications(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return json(await markNotifications(user.id, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
