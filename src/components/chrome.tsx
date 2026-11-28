
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icons, RideXLogo } from "@/components/brand";
import { apiFetch, jsonInit, storeToken } from "@/lib/client";
import type { PublicUser } from "@/lib/auth";

export const fieldClass =
  "w-full rounded-xl border border-[#e3e6ee] bg-white px-4 py-3 text-[0.98rem] text-ink outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/12";
export const labelClass = "block text-[0.85rem] font-semibold text-ink-soft";

type Note = { id: string; title: string; body?: string | null; read: boolean; createdAt: string; rideId?: string | null };

// A page that creates or ends a session without navigating away (for example the driver
// application on /drive, which signs the new driver in) dispatches this event so the header
// re-checks who is signed in instead of showing "Log In / Sign Up" to a signed-in person.
export const SESSION_CHANGED = "ridex:session-changed";

export function useSession() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await apiFetch("/api/auth/me");
        const data = await response.json();
        if (active) setUser(data.user ?? null);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setReady(true);
      }
    };
    void load();
    const onChange = () => void load();
    window.addEventListener(SESSION_CHANGED, onChange);
    return () => {
      active = false;
      window.removeEventListener(SESSION_CHANGED, onChange);
    };
  }, []);
  return { user, ready, setUser };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const unread = notes.filter((note) => !note.read).length;

  async function load() {
    const response = await apiFetch("/api/notifications");
    if (!response.ok) return;
    const data = await response.json();
    setNotes(data.notifications ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    const openNotes = () => setOpen(true);
    window.addEventListener("ridex:open-notifications", openNotes);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("ridex:open-notifications", openNotes);
    };
  }, []);

  async function markAll() {
    setNotes((current) => current.map((note) => ({ ...note, read: true })));
    await apiFetch("/api/notifications", jsonInit("POST", { all: true })).catch(() => undefined);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-transparent text-ink transition-colors hover:border-hairline hover:bg-panel"
      >
        <Icons.Bell className="h-[1.35rem] w-[1.35rem]" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[0.65rem] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
<div className="fixed right-4 top-[84px] z-[100] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_24px_50px_-24px_rgba(22,35,63,0.45)] lg:absolute lg:right-0 lg:top-auto lg:mt-2">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <p className="font-semibold text-ink">Notifications</p>
            {unread > 0 ? (
              <button type="button" onClick={markAll} className="text-[0.8rem] font-semibold text-brand">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="px-4 py-8 text-center text-[0.9rem] text-body">No notifications yet.</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className={`border-b border-hairline px-4 py-3 last:border-b-0 ${note.read ? "" : "bg-brand-soft/50"}`}>
                  <p className="text-[0.9rem] font-semibold text-ink">{note.title}</p>
                  {note.body ? <p className="mt-1 text-[0.82rem] leading-relaxed text-body">{note.body}</p> : null}
                  <p className="mt-1 text-[0.72rem] text-muted">{new Date(note.createdAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const NAV = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/rides", label: "Rides" },
  { href: "/drive", label: "Drive With Us" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    storeToken(null);
    window.location.href = "/";
  }

  const dashboard = user?.role === "admin" ? "/admin" : user?.role === "driver" ? "/driver" : "/rides";

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-white/95 backdrop-blur-md">
      <div className="rx-container flex h-[76px] items-center justify-between gap-6">
        <Link aria-label="RideX home" className="shrink-0" href="/">
          <RideXLogo />
        </Link>
        <nav className="hidden items-center gap-9 lg:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`relative py-2 text-[0.95rem] font-medium transition-colors ${active ? "text-brand" : "text-ink-soft hover:text-brand"}`}>
                {item.label}
                <span className={`absolute -bottom-0.5 left-1/2 h-[2px] w-[26px] -translate-x-1/2 rounded-full bg-brand transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? <NotificationBell /> : null}
          {user ? (
            <>
              <Link href={user.role === "admin" ? "/admin/settings" : "/account"} className="hidden items-center gap-2 sm:flex">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[linear-gradient(150deg,#ffd8b8,#f4a259)] text-[0.78rem] font-bold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-[0.86rem] font-semibold text-ink">{user.name.split(" ")[0]}</span>
                  <span className="block text-[0.72rem] capitalize text-muted">{user.role}</span>
                </span>
              </Link>
              <Link href={dashboard} className="rx-btn rx-btn-ghost hidden h-[46px] px-5 text-[0.95rem] sm:inline-flex">
                {user.role === "driver" ? "Driver dashboard" : user.role === "admin" ? "Admin" : "My Rides"}
              </Link>
              <button type="button" onClick={logout} className="rx-btn rx-btn-primary h-[46px] px-4 text-[0.95rem] sm:px-6">
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="rx-btn rx-btn-ghost hidden h-[46px] px-6 text-[0.95rem] sm:inline-flex">
                Log In
              </Link>
              <Link href="/signup" className="rx-btn rx-btn-primary h-[46px] px-4 text-[0.95rem] sm:px-6">
                Sign Up
              </Link>
            </>
          )}
          <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-panel lg:hidden">
            {open ? <Icons.X className="h-6 w-6" /> : <Icons.Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-hairline bg-white px-5 py-4 lg:hidden">
          <div className="grid gap-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-[0.98rem] font-medium text-ink-soft hover:bg-panel">
                {item.label}
              </Link>
            ))}
            {user ? (
              <Link href={dashboard} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-semibold text-brand">
                Open dashboard
              </Link>
            ) : (
              <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-semibold text-ink">
                Log In
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="rx-container flex flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" aria-label="RideX home">
          <RideXLogo />
        </Link>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-[0.9rem] font-medium text-body transition-colors hover:text-brand">
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="text-[0.9rem] text-muted">© {new Date().getFullYear()} RideX</p>
      </div>
    </footer>
  );
}

export function PageFrame({
  kicker,
  title,
  intro,
  children,
  wide = false,
}: {
  kicker: string;
  title: ReactNode;
  intro?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-[12%] -top-[20%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(253,186,116,0.34)_0%,rgba(253,186,116,0)_70%)]" />
        <div className={`rx-container relative pb-16 pt-12 ${wide ? "max-w-[1180px]" : "max-w-[760px]"}`}>
          <span className="rx-eyebrow">{kicker}</span>
          <h1 className="rx-title mt-5 text-[clamp(2.4rem,5vw,4rem)]">{title}</h1>
          {intro ? <p className="mt-4 max-w-[40rem] text-[1.05rem] leading-relaxed text-body">{intro}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Notice({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "error" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-[0.88rem] font-medium ${tone === "error" ? "bg-brand-soft text-brand-dark" : "bg-brand-soft text-brand-dark"}`}>
      {children}
    </p>
  );
}

export function useLogout() {
  const router = useRouter();
  return async function logout(to = "/") {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    storeToken(null);
    router.push(to);
    router.refresh();
  };
}
