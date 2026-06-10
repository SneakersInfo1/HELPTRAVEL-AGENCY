// Checkout progress indicator — "1 Dane → 2 Płatność → 3 Potwierdzenie".
// Server-safe, reused on the guest-data view (step 1), the payment view
// (step 2) and the confirmation page (step 3). Completed steps render a
// check mark, the current step is filled emerald, future steps stay muted —
// the Booking.com pattern that keeps the buyer oriented in the funnel.

const STEPS = ["Dane", "Płatność", "Potwierdzenie"] as const;

export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Postęp rezerwacji" className="mb-5">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((label, i) => {
          const step = (i + 1) as 1 | 2 | 3;
          const done = step < current;
          const active = step === current;
          return (
            <li key={label} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`h-px w-4 shrink-0 sm:w-8 ${done || active ? "bg-emerald-500" : "bg-neutral-300"}`}
                />
              )}
              <span
                aria-current={active ? "step" : undefined}
                className="flex min-w-0 items-center gap-1.5"
              >
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    active
                      ? "bg-emerald-600 text-white"
                      : done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-neutral-200 text-neutral-500"
                  }`}
                >
                  {done ? "✓" : step}
                </span>
                <span
                  className={`truncate text-xs sm:text-sm ${
                    active ? "font-semibold text-neutral-900" : done ? "font-medium text-emerald-700" : "text-neutral-500"
                  }`}
                >
                  {label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
