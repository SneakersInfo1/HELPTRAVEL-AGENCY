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

import { TripOfferCard } from "./trip-offer-card";
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

const WELCOME_MESSAGE: ConciergeMessage = {
  role: "assistant",
  content:
    "Cześć! Dobiorę Ci wyjazd w Twoim budżecie — napisz np. „plaża do 3000 zł w sierpniu, 2 osoby”.",
};

const STARTER_CHIPS = [
  "🏖️ Plaża do 3000 zł w sierpniu",
  "🌆 City break do 1500 zł",
  "☀️ Słońce zimą do 4000 zł",
] as const;

function readStoredMessages(): ConciergeMessage[] {
  if (typeof window === "undefined") return [WELCOME_MESSAGE];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [WELCOME_MESSAGE];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [WELCOME_MESSAGE];
    return parsed as ConciergeMessage[];
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
  const payload = messages.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content }));
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

export function ConciergeChat() {
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
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      const userMessage: ConciergeMessage = { role: "user", content: trimmed };
      const next = [...messages, userMessage];
      setMessages(next);
      setInput("");
      setPending(true);

      const result = await postChat(next);
      setPending(false);
      if (!result.ok) {
        const errorText =
          result.kind === "rate-limit"
            ? "Zbyt wiele wiadomości — odczekaj chwilę i spróbuj ponownie."
            : "Chwilowo nie mogę się połączyć — spróbuj za moment.";
        setMessages((cur) => [...cur, { role: "assistant", content: errorText, isError: true }]);
        return;
      }
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: result.text, offer: result.offer, isError: result.error },
      ]);
    },
    [pending, messages],
  );

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
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-[0_2px_8px_rgba(16,84,48,0.15)]"
                  : message.isError
                    ? "max-w-[85%] rounded-2xl rounded-bl-md border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-500"
                    : "max-w-[85%] rounded-2xl rounded-bl-md border border-emerald-900/10 bg-white px-3.5 py-2.5 text-sm text-neutral-800 shadow-[0_2px_8px_rgba(16,84,48,0.06)]"
              }
            >
              {message.content}
            </div>
            {message.role === "assistant" && message.offer && (
              <div className="mt-2 w-full max-w-[92%]">
                <TripOfferCard offer={message.offer} />
              </div>
            )}
          </div>
        ))}

        {isEmptyState && (
          <div className="flex flex-col gap-2 pt-1">
            {STARTER_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void sendMessage(chip.replace(/^\p{Emoji}\s*/u, ""))}
                className="rounded-xl border border-emerald-900/15 bg-emerald-50/60 px-3.5 py-2.5 text-left text-sm font-semibold text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="flex items-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-emerald-900/10 bg-white px-3.5 py-2.5 shadow-[0_2px_8px_rgba(16,84,48,0.06)]">
              <span className="text-xs font-medium text-neutral-500">Asystent pisze</span>
              <span className="flex gap-0.5" aria-hidden>
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-emerald-400 [animation-delay:-0.3s] motion-reduce:animate-none" />
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-emerald-400 [animation-delay:-0.15s] motion-reduce:animate-none" />
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-emerald-400 motion-reduce:animate-none" />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-emerald-900/10 bg-white px-3 py-2.5">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
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
            className="h-11 min-w-0 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            aria-label="Wyślij wiadomość"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path
                d="M17 3 2 9.5l6 2.5m9-9-3.5 14L8 12m9-9L8 12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] leading-snug text-neutral-400">
          Rozmowę przetwarza dostawca AI. Ceny pochodzą z wyszukiwarki HelpTravel.
        </p>
      </div>
    </div>
  );
}
