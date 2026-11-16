"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { Icons, RideXLogo, RideXMark } from "@/components/brand";
import { NotificationBell, useLogout, useSession } from "@/components/chrome";
import { apiFetch } from "@/lib/client";

const CUSTOMER_NAV = [
  { label: "Home", href: "/", icon: Icons.Home, active: (path: string) => path === "/" },
  { label: "Book Ride", href: "/book", icon: Icons.Car, active: (path: string) => path === "/book" },
  { label: "My Rides", href: "/rides", icon: Icons.History, active: (path: string) => path === "/rides" || path.startsWith("/rides/") },
  { label: "Profile", href: "/account", icon: Icons.User, active: (path: string) => path === "/account" },
];

export function CustomerShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const pathname = usePathname();
  const { user, ready } = useSession();
  const logout = useLogout();
  const initial = user?.name?.slice(0, 1).toUpperCase() ?? "";
  const first = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 border-b border-hairline bg-white/95 backdrop-blur-md">
        <div className="flex h-[72px] items-center justify-between gap-4 px-4 lg:px-8">
          <Link href="/" aria-label="RideX home" className="shrink-0">
            <RideXLogo />
          </Link>
          {user?.role === "customer" ? (
            <div className="flex items-center gap-3">
              <NotificationBell />
              <div className="flex items-center gap-3 border-l border-hairline pl-4">
                <Link href="/account" className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(150deg,#ffd8b8,#f4a259)] text-[0.9rem] font-bold text-white">
                  {initial}
                </Link>
                <span className="hidden leading-tight sm:block">
                  <span className="block text-[0.92rem] font-semibold text-ink">{first}</span>
                  <span className="block text-[0.74rem] text-muted">Customer</span>
                </span>
                <button type="button" onClick={() => logout("/")} aria-label="Log out" title="Log out" className="grid h-10 w-10 place-items-center rounded-full text-body transition-colors hover:bg-panel hover:text-ink">
                  <Icons.LogOut className="h-[1.1rem] w-[1.1rem]" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>
      <div className="flex flex-col lg:flex-row">
        <aside className="border-b border-hairline bg-white lg:w-[220px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:gap-1.5 lg:p-5" aria-label="Customer">
            {CUSTOMER_NAV.map((item) => {
              const active = item.active(pathname);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`relative flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-[0.95rem] font-medium transition-colors ${active ? "bg-brand-soft text-brand-dark" : "text-ink-soft hover:bg-panel"}`}>
                  {active ? <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-brand" /> : null}
                  <Icon className="h-[1.1rem] w-[1.1rem]" />
                  {item.label}
                </Link>
              );
            })}
            <button type="button" onClick={() => window.dispatchEvent(new Event("ridex:open-notifications"))} className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-[0.95rem] font-medium text-ink-soft transition-colors hover:bg-panel">
              <Icons.Bell className="h-[1.1rem] w-[1.1rem]" />
              Notifications
            </button>
          </nav>
          <div className="hidden px-5 pb-6 pt-2 lg:block">
            <div className="rounded-2xl bg-panel p-4">
              <p className="flex items-center gap-2 text-[0.92rem] font-semibold text-ink">
                <Icons.LifeBuoy className="h-4 w-4 text-brand" /> Need Help?
              </p>
              <p className="mt-1 text-[0.82rem] leading-relaxed text-body">Questions about a trip? Your ride details are always on this page.</p>
              <Link href="/help" className="mt-3 inline-flex text-[0.82rem] font-semibold text-brand">
                Contact support
              </Link>
            </div>
            <div className="mt-6 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/hero-car.png" alt="" className="mx-auto h-auto w-[140px]" />
              <p className="mt-2 font-display text-[1.05rem] font-extrabold tracking-[-0.02em] text-ink">
                Ride<span className="text-brand">X</span>
              </p>
              <p className="text-[0.76rem] text-muted">Safe Rides. Better Journeys.</p>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 lg:px-10 lg:py-10">
          <div className="mb-8">
            <h1 className="rx-title text-[clamp(1.9rem,3.2vw,2.5rem)]">{title}</h1>
            {subtitle ? <p className="mt-2 text-[1rem] text-body">{subtitle}</p> : null}
          </div>
          {!ready ? <Panel>Checking your account…</Panel> : null}
          {ready && !user ? (
            <Panel>
              <p className="font-display text-xl font-semibold text-ink">Log in to continue</p>
              <p className="mt-2">Your rides, live tracking and payments stay with your RideX account.</p>
              <Link href="/login" className="rx-btn rx-btn-primary mt-6 h-12 px-7">
                Log In <Icons.ArrowRight className="h-4 w-4" />
              </Link>
            </Panel>
          ) : null}
          {ready && user && user.role !== "customer" ? (
            <Panel>
              <p className="font-display text-xl font-semibold text-ink">You&apos;re signed in as {user.role === "admin" ? "an admin" : "a driver"}</p>
              <p className="mt-2">This page is for customer bookings.</p>
              <Link href={user.role === "admin" ? "/admin" : "/driver"} className="rx-btn rx-btn-primary mt-6 h-12 px-7">
                Open your dashboard <Icons.ArrowRight className="h-4 w-4" />
              </Link>
            </Panel>
          ) : null}
          {ready && user?.role === "customer" ? children : null}
        </main>
      </div>
    </div>
  );
}

export function Panel({ children, className = "", ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-2xl border border-hairline bg-white p-6 text-[0.95rem] text-body shadow-[0_28px_60px_-50px_rgba(22,35,63,0.5)] sm:p-8 ${className}`}>{children}</div>;
}

const ADMIN_NAV = [
  { label: "Dashboard", href: "/admin", icon: Icons.Layout },
  { label: "Driver Verification", href: "/admin/verification", icon: Icons.Clipboard },
  { label: "Driver Management", href: "/admin/drivers", icon: Icons.Car },
  { label: "Ride Management", href: "/admin/rides", icon: Icons.History },
  { label: "Live Tracking", href: "/admin/live", icon: Icons.Navigation },
  { label: "Customer Management", href: "/admin/customers", icon: Icons.Users },
  { label: "Payments & Reports", href: "/admin/payments", icon: Icons.Rupee },
  { label: "Feedback & Complaints", href: "/admin/feedback", icon: Icons.Message },
  { label: "Notifications", href: "/admin/notifications", icon: Icons.Bell },
  { label: "Admin Settings", href: "/admin/settings", icon: Icons.Settings },
];

export function AdminShell({ kicker = "RideX admin", title, intro, children }: { kicker?: string; title: ReactNode; intro?: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const [user, setUser] = useState<{ role?: string; name?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await apiFetch("/api/auth/me");
        const data = await response.json();
        if (!active) return;
        setUser(data.user ?? null);
        if (data.user && data.user.role !== "admin") router.replace(data.user.role === "driver" ? "/driver" : "/rides");
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    let active = true;
    const load = async () => {
      try {
        const response = await apiFetch("/api/notifications");
        const data = await response.json();
        if (active) setUnread(data.unread ?? 0);
      } catch {
        /* keep the last count */
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMenu(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!ready) return <div className="grid min-h-screen place-items-center bg-[#f4f7fb] p-6 text-body">Checking admin access…</div>;
  if (user?.role !== "admin") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f7fb] p-6">
        <div className="max-w-lg rounded-2xl border border-hairline bg-white p-10 text-center shadow-[0_28px_60px_-50px_rgba(22,35,63,0.5)]">
          <p className="font-display text-xl font-semibold text-ink">Admin access required</p>
          <p className="mt-2 text-[0.95rem] text-body">Sign in with a RideX administrator account to open the admin dashboard.</p>
          <Link href="/admin/login" className="rx-btn rx-btn-primary mt-6 h-12 px-7">
            Admin Login <Icons.ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const nav = (
    <nav aria-label="Admin" className="flex h-full flex-col text-white">
      <Link href="/admin" className="flex items-center gap-3 px-6 pb-8 pt-7" aria-label="RideX admin home">
        <RideXMark className="h-10 w-10" />
        <span className="font-display text-[1.7rem] font-extrabold tracking-[-0.03em]">
          Ride<span className="text-brand">X</span>
        </span>
      </Link>
      <ul className="flex-1 space-y-1 overflow-y-auto px-3">
        {ADMIN_NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[0.92rem] font-medium transition-colors ${active ? "bg-brand text-white shadow-[0_12px_24px_-12px_rgba(249,115,22,0.9)]" : "text-[#c9d3e6] hover:bg-white/10 hover:text-white"}`}>
                <Icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/admin/notifications" && unread > 0 ? <span className="rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-bold text-brand-dark">{unread > 99 ? "99+" : unread}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/10 p-3">
        <button type="button" onClick={() => logout("/admin/login")} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[0.92rem] font-medium text-[#c9d3e6] transition-colors hover:bg-white/10 hover:text-white">
          <Icons.LogOut className="h-[1.1rem] w-[1.1rem]" />
          Logout
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] bg-[#0f2347] lg:block">{nav}</aside>
      {menu ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 bg-[#0f2347]/50" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] bg-[#0f2347] shadow-2xl">{nav}</aside>
        </div>
      ) : null}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 border-b border-hairline bg-white/95 px-4 backdrop-blur-md lg:px-8">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-panel lg:hidden" aria-label="Open admin menu" onClick={() => setMenu(true)}>
            <Icons.Menu className="h-6 w-6" />
          </button>
          <p className="hidden text-[0.86rem] text-muted sm:block">Signed in as {user.name}</p>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <Link href="/admin/settings" className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(150deg,#ffd8b8,#f4a259)] text-[0.85rem] font-bold text-white">
              {user.name?.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main className="px-4 py-8 lg:px-8">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-brand">{kicker}</p>
          <h1 className="rx-title mt-2 text-[clamp(1.8rem,3vw,2.5rem)]">{title}</h1>
          {intro ? <p className="mt-2 max-w-3xl text-[0.98rem] text-body">{intro}</p> : null}
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
