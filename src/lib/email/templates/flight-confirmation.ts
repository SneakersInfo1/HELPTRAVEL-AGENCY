// Email — potwierdzenie rezerwacji LOTU (PL).
//
// Bliźniak `booking-confirmation.ts` (hotele): te same reguły HTML-a mailowego
// (inline CSS, tabele, 600 px, wariant tekstowy, preheader, escapowanie).
//
// ── DLACZEGO POWSTAŁ ─────────────────────────────────────────────────────────
// Do 2026-08-29 potwierdzenie lotu było czterema linijkami HTML-a wklejonymi
// w `send-flight-alerts.ts`: numer rezerwacji, PNR, kwota jako `toFixed(2)`
// i „Dziękujemy". Brakowało WSZYSTKIEGO, co klient realnie musi mieć pod ręką
// na lotnisku i czego wymaga brief §11: tras, dat, godzin, lotnisk, nazwisk
// pasażerów, taryfy i bagażu. Kwota była przy tym w trzecim formacie w całym
// lejku („1918.34 PLN" wobec „1918 zł" na stronie i 1918,34 zł na karcie).
//
// Moduł jest CZYSTY (żadnego I/O poza `getSiteUrl`), więc daje się testować.

import { getSiteUrl } from "@/lib/mvp/site";

export interface FlightEmailLeg {
  direction: "OUTBOUND" | "INBOUND";
  originCode: string;
  destinationCode: string;
  /** Pełny ISO z godziną, np. „2026-09-20T14:35:00". */
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stops: number;
  carrier: string;
}

export interface FlightConfirmationData {
  bookingId: string;
  pnr?: string | null;
  eTicketNumbers?: string[];
  /** `true` = rezerwacja potwierdzona, ale bilet jeszcze niewystawiony. */
  ticketingPending?: boolean;
  legs?: FlightEmailLeg[];
  fareName?: string | null;
  hasCarryOnBag?: boolean;
  hasCheckedBag?: boolean;
  passengers?: Array<{ firstName: string; lastName: string; type?: string }>;
  price?: number;
  currency?: string;
  supportEmail: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** „sob., 20 września 2026, 14:35" — zakotwiczone w Europe/Warsaw. */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(d);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(d);
}

function fmtDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function stopsLabel(stops: number): string {
  if (stops === 0) return "bezpośredni";
  if (stops === 1) return "1 przesiadka";
  return `${stops} przesiadki`;
}

/**
 * Kwota — TA SAMA reguła co w UI (`formatFlightPriceExact`): grosze tylko gdy
 * istnieją. Osobna implementacja, bo `lib/flights/money.ts` jest modułem
 * klienckim, a ten szablon renderuje się na serwerze i nie chcemy ciągnąć
 * zależności między warstwami dla jednej funkcji. Zgodność pilnuje test.
 */
function fmtMoney(amount: number, currency = "PLN"): string {
  const grosze = Math.round(amount * 100);
  const hasFraction = grosze % 100 !== 0;
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
      useGrouping: "always",
    }).format(grosze / 100);
  } catch {
    return `${(grosze / 100).toFixed(2)} ${currency}`;
  }
}

function baggageLine(d: FlightConfirmationData): string | null {
  const bits: string[] = [];
  if (d.hasCarryOnBag) bits.push("bagaż podręczny");
  if (d.hasCheckedBag) bits.push("bagaż rejestrowany");
  if (bits.length === 0) return null;
  return bits.join(" + ");
}

export function renderFlightConfirmation(data: FlightConfirmationData): RenderedEmail {
  const siteUrl = getSiteUrl();
  const legs = data.legs ?? [];
  const outbound = legs.find((l) => l.direction === "OUTBOUND");
  const route = outbound ? `${outbound.originCode} → ${outbound.destinationCode}` : null;
  const moneyFmt =
    typeof data.price === "number" && data.price > 0 ? fmtMoney(data.price, data.currency || "PLN") : null;
  const bags = baggageLine(data);
  const paxNames = (data.passengers ?? []).map((p) => `${p.firstName} ${p.lastName}`.trim()).filter(Boolean);

  const subject = route
    ? `Potwierdzenie rezerwacji lotu ${route} – ${data.bookingId}`
    : `Potwierdzenie rezerwacji lotu – ${data.bookingId}`;

  // Preheader: to, co widać w skrzynce PRZED otwarciem. Numer rezerwacji jest
  // tam najużyteczniejszy — po nim klient szuka maila miesiąc później.
  const preheader = outbound
    ? `${route} · ${fmtDateTime(outbound.departureTime)} · nr ${data.bookingId}`
    : `Rezerwacja ${data.bookingId}`;

  const legRowsHtml = legs
    .map((l) => {
      const label = l.direction === "OUTBOUND" ? "Wylot" : "Powrót";
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e3ece7;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1f6b4a;">${escHtml(label)}</div>
            <div style="margin-top:4px;font-size:16px;font-weight:700;color:#0f2e1f;">
              ${escHtml(fmtTime(l.departureTime))} ${escHtml(l.originCode)} &nbsp;→&nbsp; ${escHtml(fmtTime(l.arrivalTime))} ${escHtml(l.destinationCode)}
            </div>
            <div style="margin-top:3px;font-size:13px;color:#4a6357;">
              ${escHtml(fmtDateTime(l.departureTime))} · ${escHtml(fmtDuration(l.durationMinutes))} · ${escHtml(stopsLabel(l.stops))}${l.carrier ? ` · ${escHtml(l.carrier)}` : ""}
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const detailRow = (label: string, value: string) => `
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#4a6357;">${escHtml(label)}</td>
          <td style="padding:7px 0;font-size:13px;font-weight:600;color:#0f2e1f;text-align:right;">${escHtml(value)}</td>
        </tr>`;

  const ticketNote = data.ticketingPending
    ? `Rezerwacja jest potwierdzona. Numer biletu (e-ticket) prześlemy, gdy przewoźnik go wystawi — zwykle w ciągu kilku godzin.`
    : `Bilet został wystawiony. Numery e-biletów znajdziesz poniżej.`;

  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f2e1f;-webkit-text-size-adjust:100%;">
<span style="display:none;font-size:1px;color:#f4f7f5;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">

      <tr><td style="padding:24px 28px 8px;">
        <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1f6b4a;">HelpTravel</div>
        <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;color:#0f2e1f;">Rezerwacja lotu potwierdzona</h1>
        <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#4a6357;">${escHtml(ticketNote)}</p>
      </td></tr>

      <tr><td style="padding:16px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:12px;color:#4a6357;">Numer rezerwacji</div>
            <div style="font-size:18px;font-weight:700;letter-spacing:.02em;color:#0f2e1f;">${escHtml(data.bookingId)}</div>
            ${data.pnr ? `<div style="margin-top:6px;font-size:12px;color:#4a6357;">Kod PNR: <strong style="color:#0f2e1f;">${escHtml(data.pnr)}</strong></div>` : ""}
          </td></tr>
        </table>
      </td></tr>

      ${
        legRowsHtml
          ? `<tr><td style="padding:8px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${legRowsHtml}</table>
      </td></tr>`
          : ""
      }

      <tr><td style="padding:12px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${paxNames.length > 0 ? detailRow(paxNames.length === 1 ? "Podróżny" : "Podróżni", paxNames.join(", ")) : ""}
          ${data.fareName ? detailRow("Taryfa", data.fareName) : ""}
          ${bags ? detailRow("Bagaż w cenie", bags) : ""}
          ${
            (data.eTicketNumbers ?? []).length > 0
              ? detailRow((data.eTicketNumbers ?? []).length === 1 ? "E-bilet" : "E-bilety", (data.eTicketNumbers ?? []).join(", "))
              : ""
          }
        </table>
      </td></tr>

      ${
        moneyFmt
          ? `<tr><td style="padding:14px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3ece7;">
          <tr>
            <td style="padding:12px 0 0;font-size:14px;font-weight:600;color:#0f2e1f;">Zapłacono</td>
            <td style="padding:12px 0 0;font-size:20px;font-weight:700;color:#8a5a1f;text-align:right;">${escHtml(moneyFmt)}</td>
          </tr>
          <tr><td colspan="2" style="padding:2px 0 0;font-size:12px;color:#4a6357;">Cena zawiera podatki i opłaty lotniskowe.</td></tr>
        </table>
      </td></tr>`
          : ""
      }

      <tr><td style="padding:20px 28px 26px;">
        <p style="margin:0;font-size:13px;line-height:1.7;color:#4a6357;">
          Na lotnisko zabierz dokument, którego numer podałeś przy rezerwacji. Odprawę online otwiera przewoźnik —
          zwykle na 24–48 godzin przed wylotem.
        </p>
        <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:#4a6357;">
          Pytania? Odpisz na tę wiadomość albo napisz na
          <a href="mailto:${escHtml(data.supportEmail)}" style="color:#1f6b4a;">${escHtml(data.supportEmail)}</a>.
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#7b8f85;">
          <a href="${escHtml(siteUrl)}" style="color:#7b8f85;">helptravel.pl</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const textLines = [
    "REZERWACJA LOTU POTWIERDZONA",
    "",
    `Numer rezerwacji: ${data.bookingId}`,
    data.pnr ? `Kod PNR: ${data.pnr}` : null,
    "",
    ...legs.map(
      (l) =>
        `${l.direction === "OUTBOUND" ? "Wylot" : "Powrót"}: ${fmtTime(l.departureTime)} ${l.originCode} -> ${fmtTime(l.arrivalTime)} ${l.destinationCode}\n` +
        `  ${fmtDateTime(l.departureTime)} · ${fmtDuration(l.durationMinutes)} · ${stopsLabel(l.stops)}${l.carrier ? ` · ${l.carrier}` : ""}`,
    ),
    legs.length > 0 ? "" : null,
    paxNames.length > 0 ? `${paxNames.length === 1 ? "Podróżny" : "Podróżni"}: ${paxNames.join(", ")}` : null,
    data.fareName ? `Taryfa: ${data.fareName}` : null,
    bags ? `Bagaż w cenie: ${bags}` : null,
    (data.eTicketNumbers ?? []).length > 0 ? `E-bilety: ${(data.eTicketNumbers ?? []).join(", ")}` : null,
    moneyFmt ? `Zapłacono: ${moneyFmt} (zawiera podatki i opłaty lotniskowe)` : null,
    "",
    ticketNote,
    "",
    `Pytania: ${data.supportEmail}`,
    siteUrl,
  ].filter((l): l is string => l !== null);

  return { subject, html, text: textLines.join("\n") };
}

/**
 * Mail o ANULOWANIU rezerwacji lotu.
 *
 * Osobna funkcja, bo do 2026-08-29 webhook `flight.book.cancelled` wysyłał
 * klientowi… POTWIERDZENIE (temat „Potwierdzenie rezerwacji lotu", treść
 * „Rezerwacja lotu potwierdzona"). Klient, któremu przewoźnik właśnie anulował
 * lot, dostawał wiadomość mówiącą coś przeciwnego.
 */
export function renderFlightCancellation(data: {
  bookingId: string;
  pnr?: string | null;
  price?: number;
  currency?: string;
  supportEmail: string;
}): RenderedEmail {
  const siteUrl = getSiteUrl();
  const moneyFmt =
    typeof data.price === "number" && data.price > 0 ? fmtMoney(data.price, data.currency || "PLN") : null;
  const subject = `Rezerwacja lotu anulowana – ${data.bookingId}`;

  const html = `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f2e1f;">
<span style="display:none;font-size:1px;color:#f4f7f5;max-height:0;max-width:0;opacity:0;overflow:hidden;">Rezerwacja ${escHtml(data.bookingId)} została anulowana.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;">
      <tr><td style="padding:24px 28px;">
        <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1f6b4a;">HelpTravel</div>
        <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;">Rezerwacja lotu została anulowana</h1>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#4a6357;">
          Rezerwacja <strong style="color:#0f2e1f;">${escHtml(data.bookingId)}</strong>${data.pnr ? ` (PNR ${escHtml(data.pnr)})` : ""} jest anulowana.
          ${moneyFmt ? `Kwota ${escHtml(moneyFmt)} zostanie zwrócona zgodnie z warunkami taryfy przewoźnika.` : ""}
        </p>
        <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#4a6357;">
          Jeśli to nie Ty prosiłeś o anulowanie — odpisz na tę wiadomość albo napisz na
          <a href="mailto:${escHtml(data.supportEmail)}" style="color:#1f6b4a;">${escHtml(data.supportEmail)}</a>. Sprawdzimy, co się stało.
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#7b8f85;"><a href="${escHtml(siteUrl)}" style="color:#7b8f85;">helptravel.pl</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    "REZERWACJA LOTU ANULOWANA",
    "",
    `Numer rezerwacji: ${data.bookingId}`,
    data.pnr ? `Kod PNR: ${data.pnr}` : null,
    moneyFmt ? `Kwota ${moneyFmt} zostanie zwrócona zgodnie z warunkami taryfy przewoźnika.` : null,
    "",
    `Jeśli to nie Ty prosiłeś o anulowanie, napisz na ${data.supportEmail}.`,
    siteUrl,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { subject, html, text };
}
