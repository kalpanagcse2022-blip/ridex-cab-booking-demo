import Link from "next/link";
import { PageFrame } from "@/components/chrome";

const STATS = [
  ["120K+", "Trips completed"],
  ["4.9 / 5", "Average rider rating"],
  ["2 min", "Median pickup time"],
  ["24 × 7", "Rider support"],
];

const POINTS = [
  ["Fast by default", "Booking takes a few taps, and the nearest verified driver is on the way."],
  ["Transparent routes", "Follow every trip live from pickup to drop-off, with no hidden detours."],
  ["Safety first", "Verified drivers, shared trip details and support whenever you need it."],
  ["A car for every trip", "Minis for the daily commute, sedans for comfort, SUVs for the whole family."],
];

export default function AboutPage() {
  return (
    <PageFrame kicker="About RideX" title={<>Moving the city, one ride at a time</>} intro="RideX is a ride platform built around a simple promise: a reliable car, a verified driver and a clear view of your journey from start to finish." wide>
      <div className="space-y-8 text-[1.02rem] leading-relaxed text-body">
        <p>We started RideX because getting across the city should feel calm, not chaotic. Riders wanted fewer surprises — a driver who shows up, a fare that matches what they were quoted, and a route they can see as it happens. Drivers wanted fair payouts and the freedom to work when it suited them.</p>
        <p>Today, RideX connects riders with a network of verified drivers. The product keeps the same priorities it had on day one: booking in seconds, live tracking on every trip, and support that answers when you call.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-hairline bg-white p-5">
              <p className="font-display text-3xl font-extrabold text-ink">{value}</p>
              <p className="mt-1 text-[0.9rem] text-body">{label}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {POINTS.map(([title, copy]) => (
            <article key={title} className="rounded-2xl border border-hairline bg-white p-5">
              <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-[0.95rem]">{copy}</p>
            </article>
          ))}
        </div>
        <Link href="/" className="inline-flex font-semibold text-brand-dark">
          ← Back to home
        </Link>
      </div>
    </PageFrame>
  );
}
