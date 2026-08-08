// Truthful trust signals shown under the payment widget and (compactly) under
// the form CTA. All claims are verifiable: TLS is enforced by Vercel/Next.js,
// Stripe is PCI DSS Level 1 (public fact), and card data never touches our
// server because the widget runs inside a Stripe-hosted iframe (architectural
// fact — confirmed by LiteAPI docs and our own integration).

// IKONY, NIE EMOTIKONY (zgłoszenie 2026-08-08: „na checkout nadal są
// emotikony, to psuje profesjonalny odbiór").
//
// Emotikona to nie jest neutralny znak: rysuje ją SYSTEM gościa, więc ten sam
// pasek zaufania wyglądał inaczej na Windowsie, iPhonie i Androidzie — kolorowo,
// w innym stylu niż reszta interfejsu i w rozmiarze, nad którym nie mamy
// kontroli. Na ekranie, na którym prosimy o dane karty, to dokładnie ten
// szczegół, który podważa wiarygodność. Ikony `lucide` rysują się jednym
// kreskowaniem, dziedziczą kolor tekstu i wyglądają tak samo wszędzie.
import { CreditCard, Hotel, ShieldCheck, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TileProps {
  icon: LucideIcon;
  children: React.ReactNode;
}

function Tile({ icon: Icon, children }: TileProps) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-neutral-600">
      <Icon aria-hidden className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2} />
      {children}
    </span>
  );
}

export function TrustStrip() {
  return (
    <div className="mt-5">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
        <Tile icon={ShieldCheck}>Połączenie szyfrowane TLS</Tile>
        <Tile icon={CreditCard}>Stripe (PCI DSS Level 1)</Tile>
        <Tile icon={Hotel}>LiteAPI · partner hotelu</Tile>
        {/* Verified Trustpilot business profile (owner-confirmed 2026-06-09).
            Outbound link, opens in a new tab — the user can vet us without
            losing the half-filled form. */}
        <Tile icon={Star}>
          <a
            href="https://pl.trustpilot.com/review/helptravel.pl"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-800"
          >
            Opinie na Trustpilot
          </a>
        </Tile>
      </div>
      <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-neutral-400">
        Dane karty wpisujesz w bezpiecznym formularzu Stripe — helptravel.pl
        nigdy ich nie widzi ani nie przechowuje.
      </p>
    </div>
  );
}
