// Wskaźnik kroku lejka lotów. Server-safe (zero stanu, zero zdarzeń).
//
// DLACZEGO: audyt konwersyjny (§28 „Czy user wie gdzie jest?") — na żadnym
// z czterech ekranów lejka nie było widać, ile kroków zostało. Człowiek,
// który nie wie, czy do zapłaty jest jeden krok czy pięć, częściej przerywa
// wypełnianie formularza dokumentów. To jedyny element, który tu dokładamy —
// reszta ekranu ma być prostsza, nie bogatsza.
//
// Świadomie NIE jest to nawigacja: kroki nie są klikalne. Skok „wstecz"
// w lejku, w którym po drodze zapada lock ceny u dostawcy, musi iść przez
// jawne „Wróć", a nie przez pasek, który wygląda jak zakładki.

import { Check } from "lucide-react";

export type FlightStep = "lot" | "taryfa" | "dane" | "platnosc";

const STEPS: Array<{ key: FlightStep; label: string; short: string }> = [
  { key: "lot", label: "Wybór lotu", short: "Lot" },
  { key: "taryfa", label: "Bagaż i taryfa", short: "Taryfa" },
  { key: "dane", label: "Dane podróżnych", short: "Dane" },
  { key: "platnosc", label: "Płatność", short: "Płatność" },
];

export function FlightStepNav({ current, className = "" }: { current: FlightStep; className?: string }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <nav aria-label="Postęp rezerwacji" className={className}>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={step.key} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold ${
                  active
                    ? "bg-brand text-white"
                    : done
                      ? "bg-brand-soft text-brand-strong"
                      : "text-ink-muted"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                ) : (
                  <span className="tabular-nums" aria-hidden>{i + 1}.</span>
                )}
                {/* Pełna nazwa od sm, skrót na telefonie — cztery pełne etykiety
                    na 375 px zawijają się do dwóch linii i pasek zaczyna
                    wyglądać jak treść, a nie jak wskaźnik. */}
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{step.short}</span>
                <span className="sr-only">
                  {done ? " (zrobione)" : active ? " (bieżący krok)" : " (przed nami)"}
                </span>
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden className={`h-px w-2 sm:w-4 ${done ? "bg-brand/40" : "bg-line"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
