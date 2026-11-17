import { HomeView } from "@/components/home-view";
import { ensureReady } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureReady();
  return <HomeView />;
}
