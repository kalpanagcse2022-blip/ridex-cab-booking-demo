import { requireUser } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { accountPayments, updateAccount } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json({ user, payments: await accountPayments(user) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return json(await updateAccount(user, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
