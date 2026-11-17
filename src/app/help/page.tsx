import { PageFrame } from "@/components/chrome";

export default function HelpPage() {
  return (
    <PageFrame kicker="Support" title="Need a hand?" intro="Ride details, payment status and driver updates stay on the ride page. Support never asks for your password.">
      <div className="rounded-2xl border border-hairline bg-white p-6">
        <dl className="grid gap-4 text-[0.98rem]">
          <div>
            <dt className="text-[0.78rem] uppercase tracking-[0.08em] text-muted">Email</dt>
            <dd className="mt-1 font-semibold text-ink">support@ridex.app</dd>
          </div>
          <div>
            <dt className="text-[0.78rem] uppercase tracking-[0.08em] text-muted">Phone</dt>
            <dd className="mt-1 font-semibold text-ink">+91 44 4000 2026</dd>
          </div>
          <div>
            <dt className="text-[0.78rem] uppercase tracking-[0.08em] text-muted">Live tracking</dt>
            <dd className="mt-1 text-body">A location is labelled live only when a GPS update arrived in the last 90 seconds. Older points stay visible as last known locations.</dd>
          </div>
          <div>
            <dt className="text-[0.78rem] uppercase tracking-[0.08em] text-muted">Payments</dt>
            <dd className="mt-1 text-body">Cash is confirmed by the driver. Online checkout is a labelled demo — no real money is transferred and no payment gateway is called.</dd>
          </div>
        </dl>
      </div>
    </PageFrame>
  );
}
