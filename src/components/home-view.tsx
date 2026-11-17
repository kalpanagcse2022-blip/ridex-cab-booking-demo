"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { Icons } from "@/components/brand";
import { SiteFooter, SiteHeader } from "@/components/chrome";

type IconType = ComponentType<{ className?: string }>;

const FEATURES: { title: string; copy: string; icon: IconType }[] = [
  { title: "Quick Booking", copy: "Book your ride in just a few taps.", icon: Icons.Zap },
  { title: "Live Tracking", copy: "Follow your driver in real time.", icon: Icons.MapPin },
  { title: "Safe & Trusted", copy: "Verified drivers and transparent rides.", icon: Icons.Shield },
  { title: "Multiple Cars", copy: "Choose the ride that fits your journey.", icon: Icons.Car },
];

const STEPS: { title: string; copy: string; icon: IconType }[] = [
  { title: "Set Your Location", copy: "Enter pickup & destination.", icon: Icons.MapPin },
  { title: "Choose Your Ride", copy: "Pick your favorite car.", icon: Icons.Car },
  { title: "Book & Track", copy: "Get real-time updates.", icon: Icons.Navigation },
  { title: "Reach Safely", copy: "Enjoy your ride.", icon: Icons.Shield },
];

// The hero visual is purely illustrative marketing art (a sample trip), exactly like the
// reference site. It is not live data and is never presented as a real driver or ride.
// It carries no place names: only the route, the two markers and a status card.
function HeroVisual() {
  return (
    <div className="w-full">
      <div className="@container relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_100%_at_70%_20%,#fff7ef_0%,#fdf1e7_38%,#f7f4f2_100%)] shadow-[0_40px_80px_-56px_rgba(234,88,12,0.55)] sm:aspect-[16/11] sm:rounded-[2.2rem]">
        {/* Plain <img>: the hero art is flipped and cropped with CSS, so next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hero-car.png" alt="A modern RideX cab on a city road with the skyline behind it" className="absolute inset-0 h-full w-full object-cover object-[52%_58%]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_60%_at_28%_38%,rgba(253,186,116,0.42)_0%,rgba(253,186,116,0)_62%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[26%] bg-[linear-gradient(180deg,rgba(253,248,245,0.92)_0%,rgba(253,248,245,0)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-[linear-gradient(0deg,rgba(253,248,245,0.95)_0%,rgba(253,248,245,0)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[16%] bg-[linear-gradient(90deg,rgba(253,248,245,1)_0%,rgba(253,248,245,0)_100%)]" />

        <div className="absolute left-[22%] top-[34%]">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-brand/40" style={{ animation: "rx-pulse-ring 2.6s ease-out infinite" }} />
            <span className="relative grid h-[3.2cqw] w-[3.2cqw] place-items-center rounded-full border-[0.35cqw] border-white bg-brand shadow-[0_0.8cqw_1.6cqw_rgba(234,88,12,0.45)]" />
          </div>
        </div>

        <div className="rx-float absolute left-[24%] top-[14%] w-[41%]">
          <div className="flex items-center gap-[1.6cqw] rounded-[1.7cqw] border border-white/80 bg-white/95 px-[1.8cqw] py-[1.4cqw] shadow-[0_1.8cqw_3.6cqw_-1.2cqw_rgba(22,35,63,0.28)] backdrop-blur-sm">
            <span className="grid h-[5.4cqw] w-[5.4cqw] shrink-0 place-items-center rounded-full bg-[linear-gradient(150deg,#ffd8b8,#f4a259)] text-[max(7px,2.1cqw)] font-bold text-white ring-[0.3cqw] ring-white">RK</span>
            <span className="min-w-0">
              <span className="block truncate text-[max(7px,1.85cqw)] font-semibold leading-tight text-ink">Your driver is on the way</span>
              <span className="mt-[0.3cqw] flex items-center gap-[0.6cqw] text-[max(7px,1.6cqw)] font-medium text-body">
                2 min<span className="h-[0.35cqw] w-[0.35cqw] rounded-full bg-brand" />0.8 km
              </span>
            </span>
          </div>
          <div className="ml-[22%] h-[2cqw] w-[2cqw] rotate-45 rounded-[0.3cqw] border-b border-r border-white/80 bg-white/95 shadow-[0_1cqw_2cqw_-1cqw_rgba(22,35,63,0.3)]" />
        </div>

        <div className="absolute right-[4%] top-[14%] w-[25.5cqw]">
          <div className="rounded-[3.2cqw] border-[0.55cqw] border-[#23252b] bg-[#23252b] shadow-[0_3cqw_5cqw_-1.6cqw_rgba(22,35,63,0.5)]">
            <div className="relative aspect-[9/18.6] w-full overflow-hidden rounded-[2.6cqw] bg-[#eef1ec]">
              <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-[1.8cqw] pt-[1cqw] text-[max(7px,1.25cqw)] font-semibold text-[#4a5568]">
                <span>9:41</span>
                <span className="flex items-center gap-[0.5cqw]">
                  <span className="h-[0.7cqw] w-[0.7cqw] rounded-full bg-[#4a5568]" />
                  <span className="h-[1.1cqw] w-[2.2cqw] rounded-[0.3cqw] border-[0.18cqw] border-[#4a5568]" />
                </span>
              </div>
              <div className="absolute left-1/2 top-[0.7cqw] h-[1.1cqw] w-[7cqw] -translate-x-1/2 rounded-full bg-[#23252b]" />
              <svg viewBox="0 0 270 560" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <rect width="270" height="560" fill="#f2f0ea" />
                <path d="M0 392 C62 372 118 400 176 372 C214 354 244 360 270 348 L270 560 L0 560 Z" fill="#e2ece0" />
                <path d="M182 0 C196 78 168 132 196 196 C214 238 246 258 270 268 L270 0 Z" fill="#dceaf2" />
                <g fill="#e7e4dc">
                  <rect x="16" y="52" width="72" height="58" rx="7" />
                  <rect x="104" y="30" width="58" height="80" rx="7" />
                  <rect x="16" y="140" width="60" height="72" rx="7" />
                  <rect x="94" y="132" width="66" height="52" rx="7" />
                  <rect x="24" y="248" width="76" height="62" rx="7" />
                  <rect x="122" y="222" width="52" height="70" rx="7" />
                  <rect x="182" y="316" width="70" height="56" rx="7" />
                  <rect x="30" y="424" width="82" height="70" rx="7" />
                  <rect x="132" y="446" width="64" height="58" rx="7" />
                </g>
                <g stroke="#ffffff" strokeLinecap="round" fill="none">
                  <path d="M0 122 H270" strokeWidth="16" />
                  <path d="M0 232 H270" strokeWidth="12" />
                  <path d="M0 348 H270" strokeWidth="14" />
                  <path d="M0 424 H270" strokeWidth="10" />
                  <path d="M86 0 V560" strokeWidth="14" />
                  <path d="M176 0 V560" strokeWidth="10" />
                  <path d="M232 232 V560" strokeWidth="9" />
                </g>
                <path d="M78 122 C78 178 122 196 122 248 C122 300 92 318 92 372 C92 420 120 432 140 452" stroke="#2f80ed" strokeWidth="11" fill="none" strokeLinecap="round" />
                <path d="M122 248 C122 300 92 318 92 372 C92 420 120 432 140 452" stroke="#f97316" strokeWidth="11" fill="none" strokeLinecap="round" />
                <path className="rx-dash" d="M122 248 C122 300 92 318 92 372 C92 420 120 432 140 452" stroke="#ffd0a6" strokeWidth="4" fill="none" strokeLinecap="round" />
                <circle cx="78" cy="122" r="11" fill="#2f80ed" stroke="#fff" strokeWidth="5" />
                <circle cx="140" cy="452" r="11" fill="#f97316" stroke="#fff" strokeWidth="5" />
              </svg>
              <div className="absolute left-[38%] top-[52%] z-10 grid h-[4.6cqw] w-[4.6cqw] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[1.2cqw] border-[0.25cqw] border-white bg-ink shadow-[0_0.8cqw_1.6cqw_rgba(22,35,63,0.4)]">
                <Icons.Car className="h-[2.6cqw] w-[2.6cqw] text-white" />
              </div>
              <div className="absolute inset-x-0 bottom-0 z-0 bg-white px-[1.8cqw] pb-[1.6cqw] pt-[3.2cqw] shadow-[0_-1cqw_2cqw_-1cqw_rgba(22,35,63,0.18)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-[0.7cqw] text-[max(7px,1.35cqw)] font-semibold text-body">
                    <Icons.Navigation className="h-[1.9cqw] w-[1.9cqw] text-brand" />
                    En route
                  </span>
                  <span className="rounded-full bg-brand-soft px-[1.2cqw] py-[0.35cqw] text-[max(7px,1.2cqw)] font-semibold text-brand-dark">Live</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* hand-written "Live Tracking" tag: sits above the phone, its arrow points at the driver card */}
        <div className="pointer-events-none absolute right-[3.5%] top-[0.5%] flex items-start gap-[0.4cqw]">
          <svg viewBox="0 0 120 110" className="mt-[0.6cqw] h-[7.5cqw] w-[8.2cqw]" fill="none" aria-hidden="true">
            <path d="M104 6 C112 34 100 62 62 82 C44 91 28 94 14 94" stroke="#f97316" strokeWidth="5" strokeLinecap="round" />
            <path d="M8 84 L14 95 L27 91" stroke="#f97316" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex flex-col items-center">
            <span className="font-hand text-[max(8px,3cqw)] font-bold leading-none text-brand">Live</span>
            <span className="font-hand -mt-[0.4cqw] rotate-[-4deg] text-[max(8px,3cqw)] font-bold leading-none text-brand">Tracking</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeView() {
  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-[10%] -top-[18%] h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgba(253,186,116,0.34)_0%,rgba(253,186,116,0)_70%)]" />
          <div className="pointer-events-none absolute -left-[14%] top-[22%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0)_70%)]" />
          <div className="rx-container relative grid items-center gap-10 pb-14 pt-10 sm:gap-12 sm:pb-16 sm:pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10 lg:pb-24 lg:pt-20">
            <div className="max-w-[36rem]">
              <span className="rx-eyebrow">
                <Icons.Zap className="h-4 w-4 text-brand" />
                Fast • Safe • Reliable
              </span>
              <h1 className="rx-title mt-6 text-[clamp(2.6rem,5.4vw,4.4rem)] sm:mt-7">
                <span className="block">Your Journey.</span>
                <span className="block text-brand">Your Way.</span>
              </h1>
              <p className="mt-5 max-w-[34rem] text-pretty text-[1.05rem] leading-[1.7] text-body sm:mt-6 sm:text-[1.075rem]">
                Book a reliable ride in seconds, choose the perfect car for your journey, and track your driver live from pickup to drop-off.
              </p>
              <div className="mt-8 grid gap-3 sm:mt-9 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
                <Link href="/book" className="rx-btn rx-btn-primary h-[56px] w-full px-8 text-[1.05rem] sm:w-auto">
                  Book a Ride <Icons.ArrowRight className="h-[1.15rem] w-[1.15rem]" />
                </Link>
                <Link href="/drive" className="rx-btn rx-btn-ghost h-[56px] w-full px-8 text-[1.05rem] sm:w-auto">
                  Drive With Us
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.9rem] text-body">
                <span>Are you a RideX administrator?</span>
                <Link data-testid="home-admin-entry" href="/admin/login" className="inline-flex items-center gap-2 font-semibold text-brand-dark transition-colors hover:text-brand">
                  <Icons.Shield className="h-4 w-4" />
                  Admin Login
                  <Icons.ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section id="features" className="rx-container pb-16 lg:pb-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="group relative overflow-hidden rounded-2xl border border-hairline bg-white p-6 shadow-[0_18px_40px_-34px_rgba(22,35,63,0.5)] transition duration-200 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_28px_50px_-32px_rgba(234,88,12,0.4)]">
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#fb8c2c,#f26a0c)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  <span className="grid h-[3.35rem] w-[3.35rem] place-items-center rounded-2xl bg-[linear-gradient(150deg,#fff3e9,#ffe2cb)] ring-1 ring-white/70 transition-colors duration-200 group-hover:bg-[linear-gradient(135deg,#fb8c2c,#f26a0c)]">
                    <Icon className="h-[1.65rem] w-[1.65rem] text-brand transition-colors duration-200 group-hover:text-white" />
                  </span>
                  <h3 className="mt-5 font-display text-[1.1rem] font-semibold tracking-[-0.015em] text-ink">{feature.title}</h3>
                  <p className="mt-1.5 text-[0.93rem] leading-[1.6] text-body">{feature.copy}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="how-it-works" className="rx-container pb-20 lg:pb-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <span className="block h-[4px] w-[52px] rounded-full bg-brand" />
              <h2 className="rx-title mt-5 text-[clamp(2.05rem,3.6vw,2.75rem)]">
                How <span className="text-brand">RideX</span> Works
              </h2>
              <p className="mt-2.5 text-[1.02rem] text-body">Simple steps to get you moving.</p>
            </div>
            <Link href="/about" className="group inline-flex items-center gap-2 text-[0.98rem] font-semibold text-brand">
              Learn More
              <Icons.ArrowRight className="h-[1.15rem] w-[1.15rem] transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4 lg:gap-5">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="relative">
                  <div className="flex h-full items-center gap-4 rounded-2xl border border-hairline bg-white p-5 shadow-[0_18px_40px_-36px_rgba(22,35,63,0.5)]">
                    <div className="relative shrink-0">
                      <span className="absolute -left-2 -top-2 z-10 grid h-[26px] w-[26px] place-items-center rounded-full bg-brand text-[0.78rem] font-bold text-white shadow-[0_6px_14px_-6px_rgba(234,88,12,0.85)]">{index + 1}</span>
                      <span className="grid h-[58px] w-[58px] place-items-center rounded-full border border-[#e6e8f0] bg-cream">
                        <Icon className="h-[1.65rem] w-[1.65rem] text-brand" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[1rem] font-semibold tracking-[-0.01em] text-ink">{step.title}</h3>
                      <p className="mt-1 text-[0.88rem] leading-[1.55] text-body">{step.copy}</p>
                    </div>
                  </div>
                  {index < STEPS.length - 1 ? <Icons.ArrowRight aria-hidden className="absolute -right-[1.25rem] top-1/2 hidden h-5 w-5 -translate-y-1/2 text-[#c8cedd] lg:block" /> : null}
                </li>
              );
            })}
          </ol>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
