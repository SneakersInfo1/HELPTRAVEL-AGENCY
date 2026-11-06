// Co gość widzi po nieudanym POST /api/booking/prebook i dokąd idzie dalej.
// Czysty moduł (bez Reacta), żeby dało się go testować pod `node --test`;
// używa go formularz rezerwacji (klient) i strona rezerwacji (serwer).

// Structured prebook error: `repick` decides whether the recovery panel
// promotes "pick a fresh offer" (deterministic failures — retrying the same
// offerId cannot succeed) over plain retry (transient failures).
export interface FormError {
  message: string;
  repick: boolean;
  /** Pokój się wyprzedał (RATE_UNAVAILABLE — także prebook 2001). Ponowienie
      tej samej oferty nic nie da, więc jedyną drogą dalej jest lista pokoi
      tego hotelu; przycisk płatności znika. */
  soldOut?: boolean;
}

const SOLD_OUT_MESSAGE = "Ten pokój właśnie się wyprzedał — wybierz inną ofertę.";

// code → recovery classification for /api/booking/prebook failures.
// PREBOOK_EXPIRED / RATE_UNAVAILABLE: the offer is gone — only a fresh rate
// helps. LITEAPI_DOWN is ALSO classified repick: production logs (2026-06-09)
// show it firing deterministically for specific offers (supplier rejected /
// price drifted), and the user who retried it 4× hit the same wall each
// time — while picking another offer worked on the first try.
export function classifyPrebookError(
  code: string | undefined,
  httpStatus: number,
  apiMessage: string | undefined,
): FormError {
  switch (code) {
    // Wyprzedany pokój: LiteAPI 410 albo prebook 2001 „no prebook
    // availability" (logi 2026-11-03 — wcześniej szło jako LITEAPI_DOWN).
    case "RATE_UNAVAILABLE":
      return { message: apiMessage ?? SOLD_OUT_MESSAGE, repick: true, soldOut: true };
    case "PREBOOK_EXPIRED":
      return {
        message:
          apiMessage ??
          "Ta oferta nie jest już dostępna. Wybierz ofertę ponownie na stronie hotelu.",
        repick: true,
      };
    case "LITEAPI_DOWN":
    case "prebook_no_payment_session":
      return {
        message:
          "Nie udało się potwierdzić tej oferty u dostawcy — najczęściej oznacza to, że cena lub dostępność właśnie się zmieniła. Wybierz ofertę ponownie, to zajmie chwilę.",
        repick: true,
      };
    case "RATE_LIMIT_EXCEEDED":
      return {
        message: apiMessage ?? "Zbyt wiele prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.",
        repick: false,
      };
    // Przerwa techniczna po naszej stronie (np. niedostępny magazyn sesji):
    // inna oferta skończyłaby się tak samo, więc NIE odsyłamy do ponownego
    // wyboru — mówimy wprost, że rezerwacje chwilowo nie działają.
    case "TEMPORARILY_UNAVAILABLE":
      return {
        message:
          apiMessage ??
          "Rezerwacje są chwilowo wstrzymane z powodu przerwy technicznej. Nic nie zostało pobrane — spróbuj ponownie za jakiś czas.",
        repick: false,
      };
    default:
      return {
        message: apiMessage ?? "Nie udało się rozpocząć rezerwacji. Spróbuj ponownie.",
        repick: httpStatus >= 500,
      };
  }
}

// Deep link back to THIS hotel with the same stay parameters, landing on the
// rooms list (`#rooms` in rooms-section.tsx — also in its "no rooms" state).
// Used by the prebook-error recovery panel: when LiteAPI rejects the offer
// (price changed / sold out / provider hiccup), retrying the same dead
// offerId is futile — the productive path is re-picking a fresh rate on the
// hotel page. Production logs 2026-06-09 show a user retrying the same offer
// 4× into a 503 wall and bouncing; this gives that user a working exit.
export function buildBackToRoomsHref(
  hotelId: string,
  stay: { checkin: string; checkout: string; adults?: string; rooms?: string; children?: string },
): string {
  const params = new URLSearchParams({ checkin: stay.checkin, checkout: stay.checkout });
  if (stay.adults) params.set("adults", stay.adults);
  if (stay.rooms) params.set("rooms", stay.rooms);
  if (stay.children) params.set("children", stay.children);
  return `/hotele/${encodeURIComponent(hotelId)}?${params.toString()}#rooms`;
}
