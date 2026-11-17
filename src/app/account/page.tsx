"use client";

import Link from "next/link";
import { AccountForm } from "@/components/account-form";
import { PageFrame, useSession } from "@/components/chrome";
import { CustomerShell, Panel } from "@/components/shells";

export default function AccountPage() {
  const { user, ready } = useSession();
  if (!ready) return <PageFrame kicker="Account" title="Profile"><Panel>Checking your account…</Panel></PageFrame>;
  if (!user) {
    return (
      <PageFrame kicker="Account" title="Profile">
        <Panel>
          <p>Log in to manage your profile.</p>
          <Link href="/login" className="rx-btn rx-btn-primary mt-4 h-11 px-6">Log In</Link>
        </Panel>
      </PageFrame>
    );
  }
  if (user.role === "customer") {
    return (
      <CustomerShell title="Profile" subtitle="Your details, password and payment history.">
        <AccountForm />
      </CustomerShell>
    );
  }
  return (
    <PageFrame kicker="Account" title="Profile" intro="Update the details RideX uses for your trips." wide>
      <AccountForm showPayments={user.role === "driver"} />
    </PageFrame>
  );
}
