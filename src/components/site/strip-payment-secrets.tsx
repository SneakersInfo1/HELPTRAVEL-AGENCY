"use client";

// Usuwa z adresu przeglądarki poświadczenia doklejane przez Stripe'a.
//
// POWÓD (audyt prywatności PR #2A, 2026-09-19). Po płatności Stripe wraca na
// nasz adres, doklejając do niego `payment_intent_client_secret`. To jest
// POŚWIADCZENIE: pozwala po stronie klienta odczytywać i potwierdzać ten
// PaymentIntent. Adres z takim parametrem lądował w pasku adresu, w nagłówku
// `Referer` wychodzącym do stron trzecich, w historii przeglądarki, w schowku
// gdy ktoś skopiuje link — i w każdym narzędziu analitycznym, które czyta
// `document.location` na własną rękę (Microsoft Clarity robi dokładnie to).
//
// DLACZEGO USUWAMY TYLKO SEKRETY, A NIE CAŁY QUERY. `sid` (nasza sesja
// rezerwacji) i `payment_intent` są CZYTANE przez stronę powrotu i muszą
// zostać: strona hotelowa bez `sid` pokazuje „Brak identyfikatora sesji", więc
// wycięcie go zamieniłoby odświeżenie strony po udanej płatności w komunikat
// o błędzie. Parametry poniżej są inne — sprawdzone: NIE CZYTA ICH ŻADEN kod
// w repo, są wyłącznie dodatkiem Stripe'a. Ich usunięcie nie może niczego
// zepsuć, bo nic od nich nie zależy.
//
// DLACZEGO NIE „server-side exchange → redirect na czysty adres", czyli
// wariant preferowany w briefie: lot TAK to robi (`/loty/platnosc/return`
// przekierowuje na `/loty/potwierdzenie/[bookingId]`), ale hotel renderuje
// potwierdzenie NA stronie powrotu, z danych finalizacji. Przeniesienie tego
// na czysty adres wymagałoby nowej trasy potwierdzenia hotelu i przebudowy
// ścieżki, po której płyną pieniądze — czyli zmiany nieproporcjonalnej do
// problemu i ryzykownej. Stąd: wycinamy sam sekret, a gwarancję wobec Clarity
// daje bramka tras w `microsoft-clarity.tsx`, która nie zależy od kolejności.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { stripPaymentSecrets } from "@/lib/analytics/payment-url";

export function StripPaymentSecrets() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const czysty = stripPaymentSecrets(window.location.href);
      if (czysty === null) return;

      // PRZEKAZUJEMY ISTNIEJĄCY `history.state` — i to nie jest kosmetyka.
      //
      // Next łata `history.replaceState` i przy obcym stanie synchronizuje
      // router z nowym adresem. Stan zapisany przez Next niesie `__NA`, a na
      // taki wpis łatka reaguje wywołaniem oryginalnej metody i NIE rusza
      // routera. Efekt: zmienia się wyłącznie pasek adresu, a wyrenderowana
      // strona powrotu zostaje nietknięta — żadnego ponownego renderu ścieżki
      // płatniczej.
      window.history.replaceState(window.history.state, "", czysty);
    } catch {
      // Czyszczenie adresu nie ma prawa wywrócić strony potwierdzenia.
    }
  }, [pathname]);

  return null;
}
