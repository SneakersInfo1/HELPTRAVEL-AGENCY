import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/site/contact-form";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontakt do HelpTravel: pytania o serwis, zgłoszenia błędów, uwagi do treści i kontakt w sprawie współpracy.",
  alternates: {
    canonical: "/kontakt",
  },
  openGraph: {
    title: "Kontakt | HelpTravel",
    description: "Masz pytanie, uwagę albo chcesz zgłosić błąd? Tutaj najszybciej skontaktujesz się z HelpTravel.",
    url: "/kontakt",
    type: "website",
  },
};

const contactBoxes = [
  {
    title: "Dla użytkownika",
    body: "Pytania o planner, zapisane plany, linki do partnerów albo to, od czego najlepiej zacząć planowanie.",
  },
  {
    title: "Zgłoszenie błędu",
    body: "Najbardziej pomaga link do konkretnej strony, data, krótki opis problemu i to, co miało zadziałać.",
  },
  {
    title: "Współpraca",
    body: "Możesz napisać w sprawie partnerstwa, treści lub innych tematów związanych z rozwojem serwisu.",
  },
];

export default function ContactPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kontakt</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Masz pytanie, uwagę albo znalazłeś błąd?</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Napisz do nas, jeśli chcesz zgłosić problem na stronie, dopytać o działanie serwisu albo skontaktować się w
          sprawie współpracy. Najłatwiej przyspieszyć odpowiedź, podając link do strony i krótki opis sytuacji.
        </p>
        <p className="mt-3 text-sm leading-7 text-emerald-900/72">
          Na zgłoszenia o błędach i pytania produktowe zwykle odpowiadamy w ciągu 1-3 dni roboczych.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {contactEmail ? (
            <a
              href={`mailto:${contactEmail}`}
              className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              Napisz na {contactEmail}
            </a>
          ) : null}
          <Link
            href="/faq"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            Najpierw sprawdź FAQ
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {contactBoxes.map((item) => (
          <article
            key={item.title}
            className="rounded-[1.8rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.body}</p>
          </article>
        ))}
      </section>

      <ContactForm contactEmail={contactEmail} />

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Co warto podać przy błędzie</h2>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">Link do strony albo kierunku, na którym pojawił się problem.</li>
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">Krótki opis: co kliknąłeś i co zobaczyłeś.</li>
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">Datę i przybliżoną godzinę, jeśli problem był chwilowy.</li>
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">Screen lub treść komunikatu błędu, jeśli go widziałeś.</li>
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Przydatne strony obok kontaktu</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/faq" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              FAQ
            </Link>
            <Link href="/linki-partnerskie" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Linki partnerskie
            </Link>
            <Link href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Jak to działa
            </Link>
            <Link href="/o-nas" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              O serwisie
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}


