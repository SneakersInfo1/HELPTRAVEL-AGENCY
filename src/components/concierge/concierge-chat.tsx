"use client";

// Konwersacja AI Concierge (Task 4.2). Renderowana wewnątrz panelu
// `concierge-launcher.tsx` — ten komponent NIE zna stanu bubble/expanded,
// tylko historię wiadomości. POST JSON (bez streamingu — kontrakt
// /api/concierge/chat to POJEDYNCZY JSON {text, offer, error}, patrz
// src/app/api/concierge/chat/route.ts).
//
// Wzorce/DNA skopiowane z trip-offer-card.tsx (ta sama karta oferty) i
// quick-search-launcher.tsx (refy tylko w efektach/handlerach, żadnego
// setState w renderze poza idiomem „adjust state on prop change").
//
// Persystencja: sessionStorage (nie localStorage — historia czatu to sesja,
// nie coś co ma przetrwać dni; teaser dismissed state w launcherze używa
// localStorage, bo to osobna, trwała decyzja UX). Odczyt w LAZY initializerze
// useState — NIGDY w efekcie + setState (React Compiler constraint z zadania).

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Building2, RotateCcw, Send, Sun, Umbrella } from "lucide-react";

import { TripOfferCard } from "./trip-offer-card";
import { track } from "@/lib/analytics/track";
import type { TripOffer } from "@/lib/concierge/types";

export interface ConciergeMessage {
  role: "user" | "assistant";
  content: string;
  offer?: TripOffer | null;
  /** Wiadomość-błąd (subdued styling) — odpowiedź z `error:true` albo błąd sieci. */
  isError?: boolean;
}

const STORAGE_KEY = "helptravel-concierge-chat-v1";
const MAX_STORED_MESSAGES = 40;
const MAX_INPUT_LENGTH = 1500;
const HISTORY_WINDOW = 20;

// Powitanie sprzedażowe (feedback właściciela): otwiera problemem użytkownika
// („nie wiesz dokąd") i obiecuje TYLKO to, co bot realnie robi — konkretną
// ofertę lot+hotel z realnymi cenami. Zero fałszywej presji (PRODUCT.md).
const WELCOME_MESSAGE: ConciergeMessage = {
  role: "assistant",
  content:
    "Nie wiesz, dokąd polecieć? Od tego jestem. Napisz budżet, termin i liczbę osób — np. „plaża do 3000 zł w sierpniu, 2 osoby” — a znajdę Ci konkretny lot i hotel w realnych cenach.",
};

// Startery jako dane strukturalne: ikona TYLKO do renderu (aria-hidden),
// prompt wysyłany do API to osobny, czysty string.
//
// Ikony Lucide, NIE emoji (zgłoszenie właściciela 2026-07-25: „paskudne
// emoji"). Trzy powody, dla których to nie jest kwestia gustu:
//   • Emoji renderuje font systemowy, więc ten sam znak wygląda inaczej na
//     Androidzie, iOS i Windowsie — nie da się tego zaprojektować.
//   • Reszta produktu mówi Lucide (Compass w trzech wejściach czatu, Building2
//     i Plane w zakładkach hero). Emoji wyglądały jak wklejone z czatu.
//   • Znikają całe klasy bugów ze stringami: poprzednia wersja wycinała emoji
//     regexem /^\p{Emoji}\s*/u, a \p{Emoji} łapie JEDEN code point — „🏖️"/„☀️"
//     to emoji + U+FE0F (variation selector), więc niewidzialny U+FE0F
//     przeciekał do payloadu API i do historii rozmowy.
// Building2 celowo to samo, co zakładka „Hotele" — ta sama rzecz, ta sama ikona.
const STARTERS = [
  { Icon: Umbrella, label: "Plaża do 3000 zł w sierpniu", prompt: "Plaża do 3000 zł w sierpniu" },
  { Icon: Building2, label: "City break do 1500 zł", prompt: "City break do 1500 zł" },
  { Icon: Sun, label: "Słońce zimą do 4000 zł", prompt: "Słońce zimą do 4000 zł" },
] as const;

// --- Walidacja rehydratacji z sessionStorage -------------------------------
// Ślepy cast `as ConciergeMessage[]` był groźny: zmanipulowany albo stary
// (cross-deploy) wpis — np. hotel.rating jako string — wywala render w
// TripOfferCard (rating.toFixed) i, bez error boundary na widgecie, całą
// stronę. Walidujemy DOKŁADNIE pola, które TripOfferCard dereferencuje
// (patrz trip-offer-card.tsx). Celowo bez Zod: zero zależności, szybko.
// Jakikolwiek zepsuty wpis → wyrzucamy CAŁĄ zapisaną rozmowę (prościej
// i bezpieczniej niż częściowy ratunek).

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalNullableFiniteNumber(value: unknown): boolean {
  return value === undefined || value === null || isFiniteNumber(value);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidOffer(value: unknown): value is TripOffer {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.cityEn !== "string" || typeof o.countryEn !== "string" || typeof o.cityPl !== "string") return false;
  if (typeof o.checkin !== "string" || typeof o.checkout !== "string") return false;
  if (!isFiniteNumber(o.adults) || !isFiniteNumber(o.children)) return false;
  if (typeof o.originIata !== "string") return false;
  if (typeof o.partial !== "boolean") return false;
  if (!isOptionalNullableFiniteNumber(o.nights)) return false;
  if (!isOptionalNullableFiniteNumber(o.totalPln)) return false;
  if (o.totalPerPersonPln !== null && !isFiniteNumber(o.totalPerPersonPln)) return false;
  if (o.wantsFlight !== undefined && typeof o.wantsFlight !== "boolean") return false;
  if (o.wantsHotel !== undefined && typeof o.wantsHotel !== "boolean") return false;

  if (o.hotel !== null) {
    if (typeof o.hotel !== "object" || o.hotel === undefined) return false;
    const h = o.hotel as Record<string, unknown>;
    if (typeof h.hotelId !== "string" || typeof h.name !== "string") return false;
    if (!isFiniteNumber(h.totalPln) || typeof h.url !== "string") return false;
    if (h.mainPhotoUrl !== null && (typeof h.mainPhotoUrl !== "string" || !isHttpUrl(h.mainPhotoUrl))) return false;
    if (h.rating !== null && !isFiniteNumber(h.rating)) return false;
    if (!isOptionalNullableFiniteNumber(h.perNightPln)) return false;
    if (!isOptionalNullableFiniteNumber(h.stars)) return false;
    if (!isOptionalNullableFiniteNumber(h.reviewCount)) return false;
    for (const field of [
      "address",
      "roomName",
      "boardName",
      "refundableTag",
      "cancellationDeadline",
      "freeCancellationDeadline",
    ] as const) {
      if (!isOptionalNullableString(h[field])) return false;
    }
    if (h.photoUrls !== undefined) {
      if (!Array.isArray(h.photoUrls) || h.photoUrls.length > 12) return false;
      if (!h.photoUrls.every((url) => typeof url === "string" && isHttpUrl(url))) return false;
    }
  }

  if (o.flight !== null) {
    if (typeof o.flight !== "object" || o.flight === undefined) return false;
    const f = o.flight as Record<string, unknown>;
    if (!isFiniteNumber(f.totalPln) || typeof f.url !== "string") return false;
    if (typeof f.outboundDepartureTime !== "string" || !isFiniteNumber(f.stops)) return false;
    if (f.carrierName !== null && typeof f.carrierName !== "string") return false;
    if (f.inboundDepartureTime !== null && typeof f.inboundDepartureTime !== "string") return false;
    if (!isOptionalNullableFiniteNumber(f.outboundDurationMinutes)) return false;
    if (!isOptionalNullableFiniteNumber(f.inboundDurationMinutes)) return false;
    if (f.hasCarryOnBag !== undefined && f.hasCarryOnBag !== null && typeof f.hasCarryOnBag !== "boolean") return false;
    if (f.hasCheckedBag !== undefined && f.hasCheckedBag !== null && typeof f.hasCheckedBag !== "boolean") return false;
  }

  return true;
}

function isValidMessage(value: unknown): value is ConciergeMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (m.role !== "user" && m.role !== "assistant") return false;
  if (typeof m.content !== "string") return false;
  if (m.isError !== undefined && typeof m.isError !== "boolean") return false;
  if (m.offer !== undefined && m.offer !== null && !isValidOffer(m.offer)) return false;
  return true;
}

function readStoredMessages(): ConciergeMessage[] {
  if (typeof window === "undefined") return [WELCOME_MESSAGE];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [WELCOME_MESSAGE];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [WELCOME_MESSAGE];
    if (!parsed.every(isValidMessage)) return [WELCOME_MESSAGE];
    return parsed;
  } catch {
    return [WELCOME_MESSAGE];
  }
}

function persistMessages(messages: ConciergeMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const capped = messages.slice(-MAX_STORED_MESSAGES);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // sessionStorage niedostępny (tryb prywatny itp.) — historia po prostu nie przetrwa.
  }
}

interface ChatApiResponse {
  text?: string;
  offer?: TripOffer | null;
  error?: boolean;
}

async function postChat(messages: ConciergeMessage[]): Promise<
  { ok: true; text: string; offer: TripOffer | null; error: boolean } | { ok: false; kind: "rate-limit" | "network" }
> {
  // Przycięcie do MAX_INPUT_LENGTH per wiadomość jest OBOWIĄZKOWE: route
  // waliduje content max 1500 (Zod → 400), a odpowiedź asystenta przy
  // max_tokens 700 potrafi przekroczyć 1500 znaków — bez slice() jedna długa
  // odpowiedź bota w historii zabijałaby całą dalszą rozmowę.
  const payload = messages
    .slice(-HISTORY_WINDOW)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_INPUT_LENGTH) }));
  let res: Response;
  try {
    res = await fetch("/api/concierge/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload }),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  if (res.status === 429) return { ok: false, kind: "rate-limit" };
  if (!res.ok && res.status !== 500) return { ok: false, kind: "network" };

  let json: ChatApiResponse;
  try {
    json = (await res.json()) as ChatApiResponse;
  } catch {
    return { ok: false, kind: "network" };
  }

  return {
    ok: true,
    text: json.text ?? "Chwilowo nie mogę odpowiedzieć — spróbuj za moment.",
    offer: json.offer ?? null,
    error: Boolean(json.error) || (!res.ok && res.status === 500),
  };
}

export function ConciergeChat({
  onOfferNavigate,
}: {
  /** Przekazywany do TripOfferCard — launcher minimalizuje panel na mobile po kliknięciu oferty. */
  onOfferNavigate?: (href: string) => boolean | void;
}) {
  const [messages, setMessages] = useState<ConciergeMessage[]>(() => readStoredMessages());
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  // Auto-scroll do dołu przy nowej wiadomości/statusie „pisze…" — mutacja DOM
  // przez ref w efekcie, nie setState w renderze. Dozwolone przez React Compiler.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  // Persist na każdą zmianę historii.
  useEffect(() => {
    persistMessages(messages);
  }, [messages]);

  // UWAGA (bug znaleziony w preview_network podczas weryfikacji): NIE wolno
  // wywoływać postChat() (side effect) wewnątrz funkcyjnego updatera
  // setMessages(prev => ...). React 19 Strict Mode w dev celowo odpala
  // updatery dwukrotnie, by wykryć nieczystość — z side-effectem w środku to
  // podwaja realny POST do API. Poprawny wzorzec: policz `next` z aktualnego
  // `messages` (domknięcie, `messages` w deps), ustaw stan zwykłą wartością,
  // dopiero PO TYM (poza updaterem) odpal side effect.
  // Wspólna „dostawa" tury: POST + dopisanie odpowiedzi albo wiadomości-błędu.
  // Wydzielona, bo używają jej i sendMessage, i retryLast (ponowienie po
  // błędzie transportu — realny incydent z preview: pierwsza wiadomość
  // trafiła na cold start i użytkownik musiał przepisywać ją ręcznie).
  // try/finally: postChat z założenia nie rzuca, ale `pending` NIE MOŻE
  // utknąć na true — input byłby zablokowany na zawsze.
  const deliver = useCallback(async (next: ConciergeMessage[]) => {
    setPending(true);
    try {
      const result = await postChat(next);
      if (!result.ok) {
        const errorText =
          result.kind === "rate-limit"
            ? "Zbyt wiele wiadomości — odczekaj chwilę i spróbuj ponownie."
            : "Chwilowo nie mogę się połączyć — spróbuj za moment.";
        setMessages((cur) => [...cur, { role: "assistant", content: errorText, isError: true }]);
        return;
      }
      if (result.offer) {
        track("concierge_offer_shown", {
          city: result.offer.cityPl,
          total_per_person: result.offer.totalPerPersonPln ?? undefined,
          partial: result.offer.partial,
        });
      }
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: result.text, offer: result.offer, isError: result.error },
      ]);
    } finally {
      setPending(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      const userMessage: ConciergeMessage = { role: "user", content: trimmed };
      const next = [...messages, userMessage];
      setMessages(next);
      setInput("");
      track("concierge_message", { message_chars: trimmed.length });
      await deliver(next);
    },
    [pending, messages, deliver],
  );

  // Ponowienie po błędzie: zdejmij końcowe wiadomości-błędy i wyślij tę samą
  // historię jeszcze raz — użytkownik NIE przepisuje swojej wiadomości.
  const retryLast = useCallback(async () => {
    if (pending) return;
    let cut = messages.length;
    while (cut > 0 && messages[cut - 1].isError) cut -= 1;
    const next = messages.slice(0, cut);
    if (next.length === 0 || next[next.length - 1].role !== "user") return;
    setMessages(next);
    track("concierge_retry", { page_path: window.location.pathname });
    await deliver(next);
  }, [pending, messages, deliver]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void sendMessage(input);
    },
    [input, sendMessage],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const isEmptyState = messages.length <= 1 && messages[0]?.role === "assistant";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.map((message, i) => (
          <div key={i} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={
                message.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm font-medium leading-6 text-white"
                  : message.isError
                    ? "max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-sunken px-3.5 py-2.5 text-sm leading-6 text-ink-muted"
                    : "max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-raised px-3.5 py-2.5 text-sm leading-6 text-ink shadow-[var(--shadow-sm)]"
              }
            >
              {message.content}
            </div>
            {message.role === "assistant" && message.offer && (
              <div className="mt-2 w-full">
                <TripOfferCard offer={message.offer} onNavigate={onOfferNavigate} />
              </div>
            )}
          </div>
        ))}

        {!pending && messages[messages.length - 1]?.isError && (
          <div className="flex items-start">
            <button
              type="button"
              onClick={() => void retryLast()}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface-raised px-4 font-semibold text-brand shadow-[var(--shadow-sm)] transition-colors duration-200 ease-out hover:border-brand/40 hover:bg-brand-soft active:bg-brand-soft motion-reduce:transition-none"
            >
              <RotateCcw aria-hidden className="h-4 w-4" strokeWidth={2} />
              <span className="text-sm">Spróbuj ponownie</span>
            </button>
          </div>
        )}

        {isEmptyState && (
          <div className="flex flex-col gap-1.5 pt-1">
            {STARTERS.map(({ Icon, label, prompt }) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                className="group flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-left transition-colors duration-200 ease-out hover:border-brand/40 hover:bg-brand-soft active:bg-brand-soft motion-reduce:transition-none"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-surface-raised"
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{label}</span>
                {/* Strzałka niesie afordancję, której sam prostokąt nie daje:
                    kliknięcie NIE wkleja tekstu do pola, tylko od razu wysyła. */}
                <ArrowRight
                  aria-hidden
                  strokeWidth={2}
                  className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
                />
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="flex items-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-surface-raised px-3.5 py-2.5 shadow-[var(--shadow-sm)]">
              <span className="text-xs font-medium text-ink-muted">Asystent pisze</span>
              <span className="flex gap-0.5" aria-hidden>
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-brand/60 [animation-delay:-0.3s] motion-reduce:animate-none" />
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-brand/60 [animation-delay:-0.15s] motion-reduce:animate-none" />
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-brand/60 motion-reduce:animate-none" />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface-raised px-3 py-2.5">
        <form onSubmit={onSubmit} className="flex items-center gap-2 text-sm">
          <label htmlFor={inputId} className="sr-only">
            Napisz wiadomość do asystenta
          </label>
          <input
            id={inputId}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_INPUT_LENGTH}
            disabled={pending}
            placeholder="Napisz, dokąd chcesz jechać…"
            // placeholder na ink-muted (6,5:1), nie na neutral-400 — domyślna
            // jasna szarość placeholdera nie przechodzi progu 4.5:1.
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface-sunken px-4 text-ink outline-none transition-colors duration-200 ease-out placeholder:text-ink-muted focus-visible:border-brand/50 focus-visible:bg-surface-raised disabled:opacity-60 motion-reduce:transition-none"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            aria-label="Wyślij wiadomość"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white [--focus-ring:#fff] transition-[filter,transform] duration-200 ease-out hover:brightness-95 active:scale-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none motion-reduce:transition-none"
          >
            <Send aria-hidden className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </form>
        {/* Treść ujawnienia bez zmian (to obowiązek informacyjny, nie ozdoba),
            ale kolor z `neutral-400` na `ink-muted`: jasna szarość nie
            przechodziła progu 4,5:1, a to jest tekst, który MA być przeczytany. */}
        <p className="mt-2 text-center text-[11px] leading-snug text-ink-muted">
          Rozmowę przetwarza dostawca AI (OpenRouter). Ceny i oferty pochodzą z wyszukiwarki
          HelpTravel. Nie podawaj danych osobowych.{" "}
          <a
            href="/polityka-prywatnosci"
            target="_blank"
            rel="noopener"
            className="font-medium underline underline-offset-2"
          >
            Polityka prywatności
          </a>
        </p>
      </div>
    </div>
  );
}
