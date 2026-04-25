"use client";

import { useMemo, useState, type FormEvent } from "react";

import { sendClientEvent } from "@/lib/mvp/client-events";

type ContactTopic = "bug" | "question" | "content" | "partner";

const topicCopy: Record<
  ContactTopic,
  {
    label: string;
    helper: string;
    subject: string;
  }
> = {
  bug: {
    label: "Blad na stronie",
    helper: "Dodaj link do strony, co probowales zrobic i co zobaczyles zamiast oczekiwanego efektu.",
    subject: "Zgloszenie bledu w HelpTravel",
  },
  question: {
    label: "Pytanie o serwis",
    helper: "Napisz, czego szukasz albo w którym miejscu serwis nie jest dla Ciebie jasny.",
    subject: "Pytanie o HelpTravel",
  },
  content: {
    label: "Uwagi do treści",
    helper: "Przydaje się link do konkretnej strony kierunku lub artykułu oraz krótka uwaga, co warto poprawić.",
    subject: "Uwagi do treści HelpTravel",
  },
  partner: {
    label: "Współpraca",
    helper: "Napisz, czego dotyczy kontakt i jaki typ współpracy masz na mysli.",
    subject: "Kontakt partnerski - HelpTravel",
  },
};

export function ContactForm({ contactEmail }: { contactEmail?: string | null }) {
  const [topic, setTopic] = useState<ContactTopic>("question");
  const [name, setName] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "ready" | "missing_email">("idle");

  const topicDetails = useMemo(() => topicCopy[topic], [topic]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!contactEmail) {
      setStatus("missing_email");
      return;
    }

    const subject = encodeURIComponent(topicDetails.subject);
    const body = encodeURIComponent(
      [
        `Temat: ${topicDetails.label}`,
        name.trim() ? `Imie: ${name.trim()}` : null,
        replyEmail.trim() ? `Email zwrotny: ${replyEmail.trim()}` : null,
        url.trim() ? `Link do strony: ${url.trim()}` : null,
        "",
        "Wiadomosc:",
        message.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );

    sendClientEvent("contact_submit", {
      topic,
      hasReplyEmail: Boolean(replyEmail.trim()),
      hasUrl: Boolean(url.trim()),
      source: "contact_page",
    });

    setStatus("ready");
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Formularz kontaktowy</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-950">Napisz, z czym potrzebujesz pomocy.</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Jedna sprawa na jedna wiadomosc. Najszybciej odpowiadamy na zgłoszenia z linkiem do strony i krótkim opisem sytuacji.
          </p>
        </div>
        {contactEmail ? (
          <a
            href={`mailto:${contactEmail}`}
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            {contactEmail}
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-emerald-950">
          Kategoria
          <select
            value={topic}
            onChange={(event) => setTopic(event.target.value as ContactTopic)}
            className="mt-2 min-h-11 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          >
            {Object.entries(topicCopy).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-[1.4rem] border border-emerald-900/10 bg-emerald-50/75 px-4 py-4 text-sm leading-6 text-emerald-900/78">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Co warto podac</p>
          <p className="mt-2">{topicDetails.helper}</p>
        </div>

        <label className="block text-sm font-semibold text-emerald-950">
          Imie lub nazwa
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>

        <label className="block text-sm font-semibold text-emerald-950">
          Email do odpowiedzi
          <input
            type="email"
            value={replyEmail}
            onChange={(event) => setReplyEmail(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>

        <label className="block text-sm font-semibold text-emerald-950 sm:col-span-2">
          Link do strony lub oferty
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://helptravel.pl/..."
            className="mt-2 min-h-11 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>

        <label className="block text-sm font-semibold text-emerald-950 sm:col-span-2">
          Wiadomosc
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            rows={6}
            placeholder="Napisz, co sie stalo, gdzie to widzisz i czego oczekiwales."
            className="mt-2 min-h-36 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm leading-6 text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Otwórz mail z gotowa wiadomoscia
        </button>
        <p className="text-sm text-emerald-900/72">Odpowiadamy zwykle w 1-3 dni robocze. Przy bledach najlepiej dołączyć link, date i screen.</p>
      </div>

      {status === "ready" ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Otwieramy Twoja aplikacje pocztowa z gotowym tematem i treścia wiadomosci.
        </p>
      ) : null}

      {status === "missing_email" ? (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Publiczny adres kontaktowy nie jest jeszcze aktywny w tej wersji serwisu. Skorzystaj z podstawowej strony
          kontaktu albo wróć tu, gdy adres zostanie uzupelniony.
        </p>
      ) : null}
    </form>
  );
}

