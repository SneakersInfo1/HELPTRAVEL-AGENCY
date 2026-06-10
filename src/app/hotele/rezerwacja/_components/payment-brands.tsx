// Payment brand marks for the checkout trust card.
//
// Inline SVG/markup — no remote images, no bundled binaries, crisp at any size,
// CSP-safe. Shown to reassure the buyer which cards are accepted and that the
// processor is Stripe. Nominative use (truthfully indicating accepted methods).

// Compact variant for the one-line trust row on the payment step — just the
// card marks, no border/"Powered by" (Stripe is already named in the text).
export function PaymentBrandsInline() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-5 w-9 items-center justify-center rounded border border-neutral-200 bg-white text-[10px] font-bold italic tracking-tight text-[#1434CB]">
        VISA
      </span>
      <span className="inline-flex h-5 w-9 items-center justify-center rounded border border-neutral-200 bg-white">
        <svg viewBox="0 0 40 24" className="h-3.5 w-auto" role="img" aria-label="Mastercard">
          <circle cx="16" cy="12" r="7" fill="#EB001B" />
          <circle cx="24" cy="12" r="7" fill="#F79E1B" />
          <path d="M20 6.26a7 7 0 000 11.48 7 7 0 000-11.48z" fill="#FF5F00" />
        </svg>
      </span>
    </span>
  );
}

export function PaymentBrands() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-emerald-200/70 pt-3">
      {/* Visa */}
      <span className="inline-flex h-6 w-11 items-center justify-center rounded border border-neutral-200 bg-white text-[12px] font-bold italic tracking-tight text-[#1434CB]">
        VISA
      </span>

      {/* Mastercard — geometric mark (font-independent) */}
      <span className="inline-flex h-6 w-11 items-center justify-center rounded border border-neutral-200 bg-white">
        <svg viewBox="0 0 40 24" className="h-4 w-auto" role="img" aria-label="Mastercard">
          <circle cx="16" cy="12" r="7" fill="#EB001B" />
          <circle cx="24" cy="12" r="7" fill="#F79E1B" />
          <path d="M20 6.26a7 7 0 000 11.48 7 7 0 000-11.48z" fill="#FF5F00" />
        </svg>
      </span>

      {/* BLIK is intentionally NOT shown until LiteAPI/Nuitee enable it for PLN —
          listing an unavailable method would mislead. Add it here once live. */}

      {/* Powered by Stripe */}
      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-900/60">
        <span aria-hidden>🔒</span>
        Powered by <span className="font-bold text-[#635BFF]">stripe</span>
      </span>
    </div>
  );
}
