// Truthful trust signals shown under the payment widget and (compactly) under
// the form CTA. All claims are verifiable: TLS is enforced by Vercel/Next.js,
// Stripe is PCI DSS Level 1 (public fact), and card data never touches our
// server because the widget runs inside a Stripe-hosted iframe (architectural
// fact — confirmed by LiteAPI docs and our own integration).

interface TileProps {
  icon: string;
  children: React.ReactNode;
}

function Tile({ icon, children }: TileProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      {children}
    </span>
  );
}

export function TrustStrip() {
  return (
    <div className="mt-5">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
        <Tile icon="🔒">Połączenie szyfrowane TLS</Tile>
        <Tile icon="💳">Stripe (PCI DSS Level 1)</Tile>
        <Tile icon="🏨">LiteAPI · partner hotelu</Tile>
      </div>
      <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-neutral-400">
        Dane karty wpisujesz w bezpiecznym formularzu Stripe — helptravel.pl
        nigdy ich nie widzi ani nie przechowuje.
      </p>
    </div>
  );
}
