import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka prywatności",
  description: "Informacje o danych, analityce, plikach cookie i partnerach zewnętrznych w HelpTravel.",
  alternates: {
    canonical: "/polityka-prywatnosci",
  },
};

const privacySections = [
  {
    title: "Jakie dane mogą być przetwarzane",
    body: "Serwis może przetwarzać podstawowe dane techniczne niezbędne do działania strony, zapisu sesji, zapisanych planów oraz podstawowej analityki ruchu i kliknięć afiliacyjnych. W praktyce chodzi głównie o dane potrzebne do utrzymania ciągłości korzystania z produktu i bezpiecznej obsługi publicznej wersji strony.",
  },
  {
    title: "Cele przetwarzania",
    body: "Zapytania do planera, kliknięcia w oferty partnerów i historia zapisanych planów mogą być przetwarzane po to, aby ulepszać działanie serwisu, mierzyć zainteresowanie treściami, analizować skuteczność poszczególnych sekcji i zachować ciągłość korzystania z produktu.",
  },
  {
    title: "Podmioty zewnętrzne",
    body: "Serwis może korzystać z zewnętrznych usług i partnerów, w tym dostawców obrazów, danych geolokalizacyjnych, wyszukiwarki lotów, narzędzi analitycznych oraz partnerów afiliacyjnych. Po przejściu do partnera obowiązują także jego zasady prywatności i regulaminy.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Prywatność</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Polityka prywatności</h1>
        <p className="mt-4 text-base leading-8 text-emerald-900/78">
          Ta strona opisuje podstawowe zasady przetwarzania danych w publicznym serwisie HelpTravel. Dokument ma
          charakter informacyjny i obejmuje głównie korzystanie ze strony, planera, zapisanych planów oraz przejścia do
          partnerów zewnętrznych.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {privacySections.map((section) => (
          <article
            key={section.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{section.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{section.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Pliki cookie i sesje</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Serwis może korzystać z plików cookie lub podobnych mechanizmów do utrzymania sesji i działania zapisanych planów.</p>
            <p>Zewnętrzne narzędzia i partnerzy są opisywani oddzielnie wtedy, gdy wchodzą w ścieżkę użytkownika lub zbieranie danych.</p>
            <p>Priorytetem pozostaje przejrzystość: komunikujemy tylko te mechanizmy, które mają realny wpływ na korzystanie z serwisu.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Aktualizacje dokumentu</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>W miarę rozwoju serwisu i wdrażania kolejnych partnerów lub narzędzi zakres polityki prywatności powinien być aktualizowany.</p>
            <p>To dotyczy szczególnie nowych źródeł danych, dodatkowej analityki, mailingów, formularzy i integracji z partnerami zewnętrznymi.</p>
            <p>Dokument jest utrzymywany tak, aby odpowiadał aktualnemu sposobówi działania serwisu i modelowi współpracy z partnerami.</p>
          </div>
        </article>
      </section>
    </main>
  );
}


