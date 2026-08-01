import type { Metadata } from "next";
import Link from "next/link";
import { Check, CreditCard, Mail, ShieldCheck } from "lucide-react";

import { PaymentMethods } from "@/components/home/payment-methods";
import { FinalCtaBanner } from "@/components/site/final-cta-banner";

// Ta strona opisywała model, którego już nie ma: „częściowo przez linki
// partnerskie", „finalna cena jest po stronie partnera", „planner". Rezerwacja
// hotelu i lotu odbywa się na helptravel.pl, płatność też — więc zdanie
// „płacisz gdzie indziej" było nie tylko nieprawdziwe, ale mówiło kupującemu,
// że transakcja, którą właśnie zaczyna, dzieje się poza serwisem.
//
// Każda liczba i każde twierdzenie poniżej ma pokrycie w kodzie:
//   • „wł. podatków i opłat · płatność w PLN" — booking-summary-card.tsx:249
//   • NUITEE TRAVEL jako rozliczający — reservation-form.tsx:440, payment-slot.tsx:183
//   • brak BLIK-a — payment-brands.tsx:43
//   • „Bezpłatna anulacja do {data}" przy ofercie — card-price.tsx:86
//   • lot = osobna płatność — loty/platnosc/page.tsx:93

export const metadata: Metadata = {
  title: "Ile kosztuje rezerwacja",
  description:
    "Wyszukiwanie i porównywanie jest bezpłatne. Płacisz za nocleg lub przelot — kwotę z podsumowania, w złotówkach, z podatkami i opłatami w środku.",
  alternates: { canonical: "/cennik" },
  openGraph: {
    title: "Ile kosztuje rezerwacja | HelpTravel",
    description:
      "Za wyszukiwanie nie płacisz nic. Za nocleg płacisz tyle, ile widnieje w podsumowaniu — w PLN, z podatkami i opłatami.",
    url: "/cennik",
  },
};

const FREE = [
  "Wyszukiwanie hoteli i lotów, filtry i porównywanie cen",
  "Katalog kierunków, przewodniki i poradniki",
  "Rezerwacja bez zakładania konta",
  "Anulacja w ofertach oznaczonych „bezpłatna anulacja” — do terminu podanego przy ofercie",
];

const STEPS = [
  {
    icon: ShieldCheck,
    title: "Wybierasz ofertę i podajesz dane gości",
    body: "Do tego momentu nic nie płacisz i niczego nie potwierdzasz. Cenę i warunki widzisz przed przejściem dalej.",
  },
  {
    icon: CreditCard,
    title: "Płacisz kartą lub portfelem cyfrowym",
    body: "Pola karty obsługuje Stripe wewnątrz formularza naszego partnera rezerwacyjnego. Dane karty nie przechodzą przez serwery HelpTravel.",
  },
  {
    icon: Mail,
    title: "Potwierdzenie dostajesz mailem",
    body: "Numer rezerwacji, termin, hotel i zapłacona kwota trafiają na Twój adres zaraz po udanej płatności.",
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm sm:p-10">
        <h1 className="max-w-3xl text-balance font-display text-3xl text-ink sm:text-hero">
          Ile kosztuje rezerwacja
        </h1>
        <p className="mt-5 max-w-[65ch] text-pretty text-base leading-8 text-ink">
          Za wyszukiwanie, porównywanie i przeglądanie kierunków nie płacisz nic. Płacisz za nocleg albo
          przelot — dokładnie tyle, ile widnieje w podsumowaniu tuż przed płatnością. Kwota jest w złotówkach
          i zawiera podatki oraz opłaty.
        </p>
        <Link
          href="/hotele/szukaj"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="text-sm font-bold text-white">Otwórz wyszukiwarkę hoteli</span>
        </Link>
      </header>

      {/* Asymetrycznie, nie dwiema bliźniaczymi kartami: lista bezpłatnych
          rzeczy jest długa, a płatne są dwie — zrównanie ich wagi sugerowałoby
          symetrię, której nie ma. */}
      <section className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
        <div>
          <h2 className="font-display text-2xl text-ink sm:text-3xl">Bezpłatne</h2>
          <ul className="mt-5 space-y-3">
            {FREE.map((item) => (
              <li key={item} className="flex gap-3">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-brand" />
                <span className="text-base leading-7 text-ink">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-display text-2xl text-ink sm:text-3xl">Płatne</h2>
          <dl className="mt-5 space-y-5">
            <div className="rounded-lg bg-surface-sunken p-5">
              <dt className="text-base font-bold text-ink">Nocleg</dt>
              <dd className="mt-1.5 text-base leading-7 text-ink-muted">
                Kwota z podsumowania rezerwacji, w PLN, wraz z podatkami i opłatami.
              </dd>
            </div>
            <div className="rounded-lg bg-surface-sunken p-5">
              <dt className="text-base font-bold text-ink">Przelot</dt>
              <dd className="mt-1.5 text-base leading-7 text-ink-muted">
                Osobna rezerwacja i osobna płatność — lot i hotel nie są sprzedawane jako jeden pakiet.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-[2rem] bg-brand-strong p-6 text-white [--focus-ring:#fff] sm:p-10">
        <h2 className="max-w-2xl text-balance font-display text-2xl sm:text-3xl">Jak przebiega płatność</h2>
        <ol className="mt-7 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <Icon aria-hidden className="size-5 text-white" />
              <h3 className="mt-3 text-base font-bold text-white">
                <span className="text-white/60">{index + 1}. </span>
                {title}
              </h3>
              <p className="mt-2 text-sm leading-7 text-white/85">{body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-9 border-t border-white/15 pt-7">
          <div className="flex justify-center sm:justify-start">
            <PaymentMethods />
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <p className="text-sm leading-7 text-white/85">
              <strong className="font-bold text-white">Na wyciągu zobaczysz NUITEE&nbsp;TRAVEL.</strong>{" "}
              Rozliczenie prowadzi Nuitee Travel — nasz partner rezerwacyjny i podmiot rozliczający
              płatność. Obciążenie pod tą nazwą jest prawidłowe.
            </p>
            <p className="text-sm leading-7 text-white/85">
              <strong className="font-bold text-white">BLIK-a na razie nie obsługujemy.</strong> Do wyboru
              są karta i portfele cyfrowe. Mówimy o tym tutaj, żeby nie okazało się to niespodzianką
              dopiero przy płatności.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Anulacja i zmiany</h2>
        <div className="mt-5 max-w-[65ch] space-y-4 text-base leading-8 text-ink">
          <p>
            Warunki ustala hotel w konkretnej taryfie, nie HelpTravel. Dlatego dwa pokoje w tym samym
            obiekcie potrafią mieć różne zasady — i dlatego nie obiecujemy jednej reguły dla wszystkich.
          </p>
          <p>
            Oferty z bezpłatną anulacją mają to napisane wprost, razem z datą, do której obowiązuje.
            W wyszukiwarce możesz zawęzić wyniki filtrem <span className="font-semibold">Bezpłatna anulacja</span>,
            jeśli termin nie jest jeszcze pewny.
          </p>
          <p>
            Pytania, które wracają najczęściej, zebraliśmy w{" "}
            <Link href="/faq" className="underline underline-offset-4">
              <span className="font-semibold text-brand">FAQ</span>
            </Link>
            .
          </p>
        </div>
      </section>

      <FinalCtaBanner
        title="Sprawdź cenę dla swojego terminu"
        body="Ceny zależą od dat i liczby osób. Wpisz kierunek i termin, a zobaczysz realne kwoty w złotówkach — bez zakładania konta."
        primaryHref="/hotele/szukaj"
        primaryLabel="Otwórz wyszukiwarkę"
        secondaryHref="/kierunki"
        secondaryLabel="Przeglądaj kierunki"
      />
    </main>
  );
}
