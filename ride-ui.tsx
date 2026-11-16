"use client";

import type { ComponentType, ReactNode } from "react";
import { Icons } from "@/components/brand";
import {
  STATUS_LABEL,
  formatMoney,
  methodLabel,
  paymentPresentation,
  statusTone,
  type PaymentRole,
  type PaymentTone,
  type RideStage,
  type StageIcon,
  type StageTone,
} from "@/lib/constants";

type IconType = ComponentType<{ className?: string }>;

/* ---------------------------------------------------------------- payment ------------- */

// Full class names are written out so Tailwind can see them.
const PAY: Record<PaymentTone, { card: string; tile: string; title: string; sub: string; badge: string; rule: string; icon: IconType }> = {
  success: {
    card: "border-green-200 bg-gradient-to-b from-green-50 to-white shadow-[0_18px_40px_-30px_rgba(22,163,74,0.6)]",
    tile: "bg-green-600 text-white shadow-[0_10px_20px_-8px_rgba(22,163,74,0.8)]",
    title: "text-green-800",
    sub: "text-green-700",
    badge: "border-green-200 bg-green-50 text-green-800",
    rule: "border-green-100",
    icon: Icons.Check,
  },
  pending: {
    card: "border-amber-200 bg-gradient-to-b from-amber-50 to-white",
    tile: "bg-amber-500 text-white",
    title: "text-amber-900",
    sub: "text-amber-800",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    rule: "border-amber-100",
    icon: Icons.Clock,
  },
  neutral: {
    card: "border-hairline bg-white",
    tile: "bg-slate-200 text-slate-600",
    title: "text-ink",
    sub: "text-body",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    rule: "border-hairline",
    icon: Icons.Info,
  },
  danger: {
    card: "border-red-200 bg-gradient-to-b from-red-50 to-white",
    tile: "bg-red-600 text-white",
    title: "text-red-800",
    sub: "text-red-700",
    badge: "border-red-200 bg-red-50 text-red-800",
    rule: "border-red-100",
    icon: Icons.XCircle,
  },
};

export type PaymentLike = {
  status: string | null | undefined;
  method: string | null | undefined;
  amount: number;
  reference?: string | null;
  paidAt?: string | null;
};

/** Small pill: green only when the backend says PAID, amber while waiting, grey/red otherwise. */
export function PaymentBadge({
  role,
  rideStatus,
  payment,
  testId,
  className = "",
}: {
  role: PaymentRole;
  rideStatus: string | null | undefined;
  payment: Pick<PaymentLike, "status" | "method">;
  testId?: string;
  className?: string;
}) {
  const p = paymentPresentation({ role, rideStatus, status: payment.status, method: payment.method });
  const tone = PAY[p.tone];
  const Icon = tone.icon;
  return (
    <span
      data-testid={testId}
      data-tone={p.tone}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.76rem] font-semibold leading-none ${tone.badge} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {p.title}
    </span>
  );
}

/**
 * The payment card used on the customer's ride page and the driver's dashboard.
 * Green with a check only for a PAID backend status; amber for pending; grey for "not yet".
 * `actions` (pay buttons) are only passed in by the caller for states that can still act.
 */
export function PaymentCard({
  role,
  rideStatus,
  payment,
  code,
  actions,
  compact = false,
}: {
  role: PaymentRole;
  rideStatus: string | null | undefined;
  payment: PaymentLike;
  code?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const p = paymentPresentation({ role, rideStatus, status: payment.status, method: payment.method });
  const tone = PAY[p.tone];
  const Icon = tone.icon;
  const paidAt = payment.paidAt ? new Date(payment.paidAt).toLocaleString() : null;
  const facts: [string, string][] = [
    ["Status", p.paid ? "Paid" : p.tone === "pending" ? "Pending" : p.title],
    ["Method", methodLabel(payment.method)],
  ];
  if (payment.reference && p.paid) facts.push(["Reference", payment.reference]);
  if (paidAt && p.paid) facts.push(["Paid on", paidAt]);
  if (code) facts.unshift(["Ride", code]);

  return (
    <section
      data-testid={p.paid ? "payment-success" : "payment-card"}
      data-tone={p.tone}
      className={`rounded-2xl border ${tone.card} ${compact ? "p-4" : "p-5 sm:p-6"}`}
    >
      <div className="flex items-start gap-3.5 sm:gap-4">
        <span className={`grid shrink-0 place-items-center rounded-full ${tone.tile} ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
          <Icon className={`${compact ? "h-5 w-5" : "h-6 w-6"} ${p.paid ? "[stroke-width:3]" : ""}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p data-testid="payment-title" className={`font-display font-bold leading-tight ${tone.title} ${compact ? "text-[1.02rem]" : "text-xl"}`}>
            {p.title}
          </p>
          <p data-testid="payment-subtitle" className={`mt-0.5 text-[0.9rem] ${tone.sub}`}>
            {p.subtitle}
          </p>
        </div>
        <p data-testid="payment-amount" className={`shrink-0 font-display font-extrabold leading-none text-ink ${compact ? "text-xl" : "text-2xl sm:text-3xl"}`}>
          {formatMoney(payment.amount)}
        </p>
      </div>
      {!compact ? (
        <dl className={`mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-[0.82rem] sm:grid-cols-4 ${tone.rule}`}>
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
              <dd className="mt-0.5 break-words font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {p.note ? (
        <p data-testid="payment-note" className="mt-3 flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 text-[0.78rem] leading-relaxed text-body ring-1 ring-black/5">
          <Icons.Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <span>{p.note}</span>
        </p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}

/* ----------------------------------------------------------- ride status -------------- */

const STAGE: Record<StageTone, { card: string; tile: string; title: string; chip: string }> = {
  slate: { card: "border-slate-200 bg-gradient-to-br from-slate-50 to-white", tile: "bg-slate-600 text-white", title: "text-slate-900", chip: "border-slate-200 bg-slate-50 text-slate-700" },
  amber: { card: "border-amber-200 bg-gradient-to-br from-amber-50 to-white", tile: "bg-amber-500 text-white", title: "text-amber-950", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  blue: { card: "border-blue-200 bg-gradient-to-br from-blue-50 to-white", tile: "bg-blue-600 text-white", title: "text-blue-950", chip: "border-blue-200 bg-blue-50 text-blue-800" },
  orange: { card: "border-orange-200 bg-gradient-to-br from-brand-soft to-white", tile: "bg-brand text-white", title: "text-ink", chip: "border-orange-200 bg-brand-soft text-brand-dark" },
  violet: { card: "border-violet-200 bg-gradient-to-br from-violet-50 to-white", tile: "bg-violet-600 text-white", title: "text-violet-950", chip: "border-violet-200 bg-violet-50 text-violet-800" },
  navy: { card: "border-slate-300 bg-gradient-to-br from-slate-100 to-white", tile: "bg-ink text-white", title: "text-ink", chip: "border-slate-300 bg-slate-100 text-ink" },
  green: { card: "border-green-200 bg-gradient-to-br from-green-50 to-white", tile: "bg-green-600 text-white", title: "text-green-900", chip: "border-green-200 bg-green-50 text-green-800" },
  red: { card: "border-red-200 bg-gradient-to-br from-red-50 to-white", tile: "bg-red-600 text-white", title: "text-red-900", chip: "border-red-200 bg-red-50 text-red-800" },
};

const STAGE_ICON: Record<StageIcon, IconType> = {
  send: Icons.Send,
  clock: Icons.Clock,
  userCheck: Icons.UserCheck,
  navigation: Icons.Navigation,
  mapPin: Icons.MapPin,
  car: Icons.Car,
  flag: Icons.Flag,
  xCircle: Icons.XCircle,
};

/** Ride-status banner + six-stage progress, driven entirely by a RideStage worked out from backend data. */
export function RideStatusCard({ stage, code, meta }: { stage: RideStage; code: string; meta?: ReactNode }) {
  const tone = STAGE[stage.tone];
  const Icon = STAGE_ICON[stage.icon];
  const completed = stage.key === "completed";
  const live = !stage.cancelled && !completed;
  return (
    <section data-testid="ride-status-card" data-stage={stage.key} data-tone={stage.tone} className={`rounded-2xl border p-5 sm:p-6 shadow-[0_24px_50px_-40px_rgba(22,35,63,0.55)] ${tone.card}`}>
      <div className="flex items-start gap-4">
        <span className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${tone.tile}`}>
          {live ? <span className="absolute inset-0 animate-ping rounded-2xl bg-current opacity-15 [animation-duration:2.4s]" /> : null}
          <Icon className="relative h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Ride {code}</p>
          <h2 data-testid="ride-status-title" className={`mt-0.5 font-display text-[1.45rem] font-bold leading-tight sm:text-2xl ${tone.title}`}>
            {stage.title}
          </h2>
          <p data-testid="ride-status-subtitle" className="mt-1 text-[0.95rem] leading-relaxed text-body">
            {stage.subtitle}
          </p>
          {meta ? <div className="mt-3">{meta}</div> : null}
        </div>
      </div>

      {stage.cancelled ? null : (
        <>
          <ol className="mt-6 grid grid-cols-6" aria-label="Ride progress">
            {stage.labels.map((label, index) => {
              const done = completed || index < stage.step;
              const current = !completed && index === stage.step;
              return (
                <li key={`${index}-${label}`} data-state={done ? "done" : current ? "current" : "upcoming"} className="relative flex flex-col items-center text-center">
                  {index < stage.labels.length - 1 ? (
                    <span aria-hidden className={`absolute left-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${done ? (completed ? "bg-green-500" : "bg-brand") : "bg-slate-200"}`} />
                  ) : null}
                  <span
                    className={`relative z-10 grid h-8 w-8 place-items-center rounded-full text-[0.78rem] font-bold ${
                      done
                        ? completed
                          ? "bg-green-600 text-white"
                          : "bg-brand text-white"
                        : current
                          ? "border-2 border-brand bg-white text-brand shadow-[0_0_0_4px_rgba(249,115,22,0.15)]"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? <Icons.Check className="h-4 w-4 [stroke-width:3]" /> : index + 1}
                  </span>
                  <span className={`mt-2 hidden px-0.5 text-[0.72rem] leading-tight sm:block ${current ? "font-bold text-ink" : done ? "font-semibold text-ink-soft" : "text-muted"}`}>{label}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[0.82rem] font-semibold text-ink sm:hidden">
            Step {Math.min(stage.step + 1, stage.labels.length)} of {stage.labels.length} · {stage.labels[Math.min(stage.step, stage.labels.length - 1)]}
          </p>
        </>
      )}
    </section>
  );
}

/** Coloured ride-status pill for lists and tables (same colour family as the status card). */
export function RideStatusPill({ status, className = "", testId = "status-pill" }: { status: string; className?: string; testId?: string }) {
  const tone = STAGE[statusTone(status)];
  return (
    <span data-testid={testId} data-status={status} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.76rem] font-semibold leading-none ${tone.chip} ${className}`}>
      {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
    </span>
  );
}

/** Pickup → destination as a small vertical timeline. */
export function RouteTimeline({ pickup, destination, className = "" }: { pickup: string; destination: string; className?: string }) {
  return (
    <div className={`relative grid gap-3 pl-6 ${className}`}>
      <span aria-hidden className="absolute bottom-[0.6rem] left-[0.4rem] top-[0.6rem] w-px bg-gradient-to-b from-[#2f80ed] to-[#e11d48] opacity-60" />
      <div className="relative">
        <span aria-hidden className="absolute -left-6 top-[0.35rem] h-3 w-3 rounded-full border-2 border-white bg-[#2f80ed] shadow ring-1 ring-[#2f80ed]/40" />
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">Pickup</p>
        <p className="text-[0.92rem] font-medium leading-snug text-ink">{pickup}</p>
      </div>
      <div className="relative">
        <span aria-hidden className="absolute -left-6 top-[0.35rem] h-3 w-3 rounded-full border-2 border-white bg-[#e11d48] shadow ring-1 ring-[#e11d48]/40" />
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">Destination</p>
        <p className="text-[0.92rem] font-medium leading-snug text-ink">{destination}</p>
      </div>
    </div>
  );
}

/** Round initial avatar in the RideX peach gradient. */
export function Avatar({ name, className = "h-11 w-11 text-[0.95rem]" }: { name: string; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-[linear-gradient(150deg,#ffd8b8,#f4a259)] font-bold text-white ring-2 ring-white ${className}`}>
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
