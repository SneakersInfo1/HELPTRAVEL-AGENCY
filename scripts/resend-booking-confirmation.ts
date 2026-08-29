// Ręczna, BEZPIECZNA ponowna wysyłka potwierdzenia dla ISTNIEJĄCEJ,
// potwierdzonej rezerwacji hotelowej.
//
// Powstało po incydencie 2026-08-28 (booking 9c-OQvmqJ): rezerwacja została
// poprawnie utworzona i potwierdzona u dostawcy, ale Resend odrzucił maila
// (HTTP 403 — nadawca `onboarding@resend.dev` to domena testowa). Klient nigdy
// nie dostał potwierdzenia. Ten skrypt dosyła TEN SAM szablon, którego używa
// normalny flow bookingu.
//
// CZEGO TEN SKRYPT NIE ROBI (świadomie — nie ma tu nawet odpowiednich importów):
//   • NIE woła LiteAPI /rates/prebook
//   • NIE woła LiteAPI /rates/book        ← żadnej nowej rezerwacji
//   • NIE dotyka Stripe: żadnego PaymentIntent, obciążenia ani zwrotu
//   • NIE zmienia ceny ani żadnego pola rezerwacji
// Jedyne wywołania sieciowe: Upstash GET (odczyt rezerwacji), LiteAPI
// GET /bookings/{id} (odczyt danych zamawiającego) i Resend send.
//
// Użycie (DRY RUN jest domyślny — nic nie wysyła):
//   pnpm booking:resend-email 9c-OQvmqJ
//   pnpm booking:resend-email 9c-OQvmqJ --to=klient@example.com
//   pnpm booking:resend-email 9c-OQvmqJ --to=klient@example.com --send
//
// Flagi:
//   --to=ADRES     nadpisuje odbiorcę (domyślnie: holder z LiteAPI)
//   --guests=N     liczba osób w mailu; bez tej flagi wiersz "Goście" jest pomijany
//   --send         WYKONUJE realną wysyłkę. Bez tej flagi to tylko podgląd.

import { getCompleted, type CompletedRecord } from "../src/lib/booking/session";
import { getBooking } from "../src/lib/liteapi/retrieve";
import { getDefaultFrom, getReplyTo } from "../src/lib/email/client";
import { planConfirmationResend } from "../src/lib/email/resend-confirmation-guard";
import { renderBookingConfirmation } from "../src/lib/email/templates/booking-confirmation";
import { sendBookingConfirmation } from "../src/lib/email/send-booking-confirmation";

function fail(msg: string): never {
  console.error(`\n  x ODMOWA: ${msg}\n`);
  process.exit(1);
}

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : undefined;
}

async function main(): Promise<void> {
  const bookingId = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const doSend = process.argv.includes("--send");
  const toOverride = flag("to");
  const guestsOverride = flag("guests");

  if (!bookingId) {
    fail("brak bookingId. Uzycie: pnpm booking:resend-email <bookingId> [--to=...] [--send]");
  }

  console.log("\n==============================================================");
  console.log(`  PONOWNA WYSYLKA POTWIERDZENIA — ${doSend ? "TRYB WYSYLKI" : "DRY RUN"}`);
  console.log("==============================================================\n");

  // 1) Rezerwacja MUSI istnieć w naszym trwałym magazynie (tylko odczyt).
  let stored: CompletedRecord | null = null;
  try {
    stored = await getCompleted(bookingId);
  } catch (err) {
    fail(`odczyt z Upstash nie powiodl sie: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Odbiorca: --to, inaczej holder z LiteAPI (GET — nie tworzy rezerwacji).
  let holderFirstName = "";
  let holderLastName = "";
  let holderEmail = toOverride ?? "";
  let providerStatus = "(nie odpytano)";
  try {
    const provider = await getBooking(bookingId);
    providerStatus = provider.status ?? "(brak pola status)";
    holderFirstName = provider.holder?.firstName?.trim() ?? "";
    holderLastName = provider.holder?.lastName?.trim() ?? "";
    if (!holderEmail) holderEmail = provider.holder?.email?.trim() ?? "";
  } catch (err) {
    console.warn(
      `  ! LiteAPI GET /bookings/${bookingId} nie powiodlo sie (${err instanceof Error ? err.message : String(err)}).`,
    );
    console.warn("    Dane zamawiajacego niedostepne — wymagane --to=ADRES.\n");
  }

  // 3) Wszystkie reguły bezpieczeństwa w jednym miejscu (testowane jednostkowo):
  //    rezerwacja istnieje + jest potwierdzona + jest odbiorca + nadawca jest
  //    produkcyjny (nigdy resend.dev). Odmowa = wyjście bez żadnej wysyłki.
  const plan = planConfirmationResend({
    bookingId,
    completed: stored,
    recipient: holderEmail,
    from: getDefaultFrom(),
  });
  if (!plan.allowed) fail(plan.reason);
  const { booking: completed, recipient, from } = plan;

  // Pomijamy, gdy nie podano --guests. Sesja z `pax` dawno wygasla, a pole
  // `adults` u dostawcy rowna sie maxOccupancy pokoju, wiec nie da sie
  // odroznic zamowionej obladzonosci od pojemnosci. Zmyslona liczba na
  // potwierdzeniu jest gorsza niz jej brak — szablon wtedy nie renderuje
  // wiersza "Goscie".
  const parsedGuests = Number.parseInt(guestsOverride ?? "", 10);
  const guestCount = Number.isFinite(parsedGuests) && parsedGuests > 0 ? parsedGuests : null;
  const replyTo = getReplyTo();

  // 4) Podgląd: dokładnie ten sam render, którego użyje wysyłka.
  const supportEmail =
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    process.env.EMAIL_REPLY_TO?.trim() ||
    "pomoc@helptravel.pl";
  const rendered = renderBookingConfirmation({
    bookingId: completed.bookingId,
    confirmationCode: completed.confirmationCode ?? null,
    hotelName: completed.hotelSummary.name,
    city: completed.hotelSummary.city,
    checkin: completed.rateSummary.checkin,
    checkout: completed.rateSummary.checkout,
    boardName: completed.rateSummary.boardName,
    price: completed.price,
    currency: completed.currency ?? "PLN",
    holder: { firstName: holderFirstName, lastName: holderLastName, email: recipient },
    guestCount,
    supportEmail,
  });

  const city = completed.hotelSummary.city ? `, ${completed.hotelSummary.city}` : "";
  console.log("  -- REZERWACJA (z trwalego magazynu) -------------------------");
  console.log(`  bookingId            : ${completed.bookingId}`);
  console.log(`  status (nasz)        : ${completed.status}`);
  console.log(`  status (LiteAPI)     : ${providerStatus}`);
  console.log(`  hotel                : ${completed.hotelSummary.name}${city}`);
  console.log(`  pobyt                : ${completed.rateSummary.checkin} -> ${completed.rateSummary.checkout}`);
  console.log(`  kwota                : ${completed.price ?? "-"} ${completed.currency ?? "PLN"}`);
  console.log(`  goscie w mailu       : ${guestCount ?? "(pominiete - nieznane)"}`);
  console.log("\n  -- E-MAIL --------------------------------------------------");
  console.log(`  From                 : ${from}`);
  console.log(`  Reply-To             : ${replyTo ?? "(nie ustawiono)"}`);
  console.log(`  To                   : ${recipient}${toOverride ? "  (z --to)" : "  (holder z LiteAPI)"}`);
  console.log(`  Subject              : ${rendered.subject}`);
  console.log(`  Rozmiar HTML         : ${rendered.html.length} znakow`);
  console.log("\n  -- GWARANCJE BEZPIECZENSTWA --------------------------------");
  console.log("  OK  LiteAPI /rates/book        NIE zostanie wywolane");
  console.log("  OK  LiteAPI /rates/prebook     NIE zostanie wywolane");
  console.log("  OK  Stripe PaymentIntent       NIE zostanie utworzony");
  console.log("  OK  Zadne obciazenie ani zwrot NIE zostanie wykonany");
  console.log("  OK  Cena i rezerwacja          pozostaja bez zmian");

  if (!doSend) {
    console.log("\n  -- DRY RUN -------------------------------------------------");
    console.log("  Nic nie wyslano. Aby wyslac naprawde, powtorz komende z --send\n");
    return;
  }

  console.log("\n  -- WYSYLKA -------------------------------------------------");
  const result = await sendBookingConfirmation({
    bookingId: completed.bookingId,
    confirmationCode: completed.confirmationCode ?? null,
    hotelSummary: completed.hotelSummary,
    rateSummary: completed.rateSummary,
    price: completed.price,
    currency: completed.currency,
    holder: { firstName: holderFirstName, lastName: holderLastName, email: recipient },
    guestCount,
  });

  if (result.ok) {
    console.log(`  OK  WYSLANO. messageId=${result.messageId ?? "(brak)"} -> ${recipient}\n`);
    return;
  }
  if ("skipped" in result) fail(`wysylka pominieta (${result.skipped}).`);
  fail(`Resend odrzucil wysylke: ${result.error}`);
}

main().catch((err) => {
  console.error(
    "\n[resend-confirmation] BLAD:",
    err instanceof Error ? `${err.name}: ${err.message}` : err,
  );
  process.exitCode = 1;
});
