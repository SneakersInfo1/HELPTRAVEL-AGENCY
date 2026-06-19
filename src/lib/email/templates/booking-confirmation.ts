// Email template — booking confirmation (Polish).
//
// Design rules for transactional HTML email (different from web HTML!):
//   • Inline CSS only. Many clients (Gmail web, Outlook) strip <style> blocks.
//   • Table-based layout for cross-client compatibility. Flexbox is out.
//   • 600px max width. Mobile clients scale this gracefully.
//   • Always ship a plain-text variant. Spam filters use it, accessibility
//     tools read it, and some clients prefer it (Apple Mail "Plain Text").
//   • Preheader hack: invisible <span> at the top so the inbox preview shows
//     useful info instead of "View this email in your browser".
//   • UTF-8 only — Polish characters must encode correctly. We escape user-
//     supplied strings via `escHtml`.
//
// We deliberately DO NOT use a React Email / JSX template. Adding @react-email
// would balloon the dependency tree for one transactional message; a hand-
// written template is auditable, fast to render, and never breaks the build.

import { getSiteUrl } from "@/lib/mvp/site";

export interface BookingConfirmationData {
  bookingId: string;
  confirmationCode?: string | null;
  hotelName: string;
  city?: string;
  /** ISO date "YYYY-MM-DD" or full ISO. */
  checkin: string;
  checkout: string;
  boardName?: string;
  price?: number;
  currency?: string;
  holder: {
    firstName: string;
    lastName: string;
    email: string;
  };
  guestCount: number;
  /** Support contact address surfaced in the body + cancellation note. */
  supportEmail: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Polish pluralization (1 vs 2-4 vs 5+) — different per noun class.
function plNights(n: number): string {
  if (n === 1) return "1 noc";
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 12 && lastTwo <= 14) return `${n} nocy`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${n} noce`;
  return `${n} nocy`;
}

function plGuests(n: number): string {
  if (n === 1) return "1 osoba";
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 12 && lastTwo <= 14) return `${n} osób`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${n} osoby`;
  return `${n} osób`;
}

function formatPlDate(iso: string): string {
  // Anchor bare YYYY-MM-DD at noon UTC so timezone math never rolls the day
  // back/forward when Intl renders in Europe/Warsaw.
  const stamp = iso.length === 10 ? `${iso}T12:00:00Z` : iso;
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(d);
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(checkin.length === 10 ? `${checkin}T00:00:00Z` : checkin);
  const b = new Date(checkout.length === 10 ? `${checkout}T00:00:00Z` : checkout);
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return Math.max(1, days);
}

function fmtMoney(amount: number, currency = "PLN"): string {
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown ISO 4217 code — fall back to a plain "1234.56 XYZ" rendering.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBookingConfirmation(data: BookingConfirmationData): RenderedEmail {
  const nights = nightsBetween(data.checkin, data.checkout);
  const checkinFmt = formatPlDate(data.checkin);
  const checkoutFmt = formatPlDate(data.checkout);
  const moneyFmt =
    typeof data.price === "number" && data.price > 0
      ? fmtMoney(data.price, data.currency || "PLN")
      : null;
  const siteUrl = getSiteUrl();

  const subject = `Potwierdzenie rezerwacji – ${data.hotelName}`;

  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f2e1f;-webkit-text-size-adjust:100%;">
  <span style="display:none !important;color:transparent;visibility:hidden;height:0;width:0;overflow:hidden;mso-hide:all;">${escHtml(data.hotelName)} · ${escHtml(checkinFmt)} → ${escHtml(checkoutFmt)} · Numer ${escHtml(data.bookingId)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7f5;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 16px 42px rgba(16,84,48,0.06);">

        <tr><td style="background:linear-gradient(135deg,#047857,#065f46);padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;">HelpTravel</div>
          <div style="margin-top:6px;font-size:24px;font-weight:700;line-height:1.2;">Rezerwacja potwierdzona ✓</div>
          <div style="margin-top:6px;font-size:14px;opacity:0.92;">Numer: ${escHtml(data.bookingId)}</div>
        </td></tr>

        <tr><td style="padding:28px 32px 8px 32px;">
          <p style="margin:0;font-size:16px;line-height:1.55;">Cześć ${escHtml(data.holder.firstName)},</p>
          <p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#27483b;">
            Dziękujemy za rezerwację. Poniżej znajdziesz wszystkie szczegóły do meldowania — zachowaj tego maila albo wydrukuj.
          </p>
        </td></tr>

        <tr><td style="padding:8px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d1e7dc;border-radius:14px;background:#f3faf6;">
            <tr><td style="padding:20px 22px 6px 22px;">
              <div style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#047857;">Pobyt</div>
              <div style="margin-top:8px;font-size:20px;font-weight:700;color:#0f2e1f;line-height:1.3;">${escHtml(data.hotelName)}</div>
              ${data.city ? `<div style="margin-top:2px;font-size:14px;color:#3b5d4d;">${escHtml(data.city)}</div>` : ""}
            </td></tr>
            <tr><td style="padding:0 22px 18px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px dashed #b9d6c7;">
                <tr><td style="padding:14px 0 6px 0;font-size:13px;color:#3b5d4d;width:140px;">Przyjazd</td><td style="padding:14px 0 6px 0;font-size:14px;font-weight:600;color:#0f2e1f;">${escHtml(checkinFmt)}</td></tr>
                <tr><td style="padding:0 0 6px 0;font-size:13px;color:#3b5d4d;">Wyjazd</td><td style="padding:0 0 6px 0;font-size:14px;font-weight:600;color:#0f2e1f;">${escHtml(checkoutFmt)}</td></tr>
                <tr><td style="padding:0 0 6px 0;font-size:13px;color:#3b5d4d;">Długość pobytu</td><td style="padding:0 0 6px 0;font-size:14px;font-weight:600;color:#0f2e1f;">${escHtml(plNights(nights))}</td></tr>
                <tr><td style="padding:0 0 6px 0;font-size:13px;color:#3b5d4d;">Goście</td><td style="padding:0 0 6px 0;font-size:14px;font-weight:600;color:#0f2e1f;">${escHtml(plGuests(data.guestCount))}</td></tr>
                ${data.boardName ? `<tr><td style="padding:0 0 6px 0;font-size:13px;color:#3b5d4d;">Pakiet</td><td style="padding:0 0 6px 0;font-size:14px;font-weight:600;color:#0f2e1f;">${escHtml(data.boardName)}</td></tr>` : ""}
              </table>
            </td></tr>
            ${
              moneyFmt
                ? `<tr><td style="padding:0 22px 22px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:10px;border:1px solid #d1e7dc;">
                <tr>
                  <td style="padding:14px 18px;font-size:13px;color:#3b5d4d;">Kwota zapłacona</td>
                  <td style="padding:14px 18px;text-align:right;font-size:18px;font-weight:700;color:#047857;">${escHtml(moneyFmt)}</td>
                </tr>
              </table>
            </td></tr>`
                : ""
            }
          </table>
        </td></tr>

        <tr><td style="padding:20px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="49%" style="padding:12px 14px;background:#f4f7f5;border-radius:10px;vertical-align:top;">
                <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#3b5d4d;">Numer w HelpTravel</div>
                <div style="margin-top:4px;font-size:14px;font-weight:600;color:#0f2e1f;font-family:'Menlo','Consolas',monospace;word-break:break-all;">${escHtml(data.bookingId)}</div>
              </td>
              <td width="2%">&nbsp;</td>
              ${
                data.confirmationCode
                  ? `<td width="49%" style="padding:12px 14px;background:#f4f7f5;border-radius:10px;vertical-align:top;">
                <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#3b5d4d;">Numer w hotelu</div>
                <div style="margin-top:4px;font-size:14px;font-weight:600;color:#0f2e1f;font-family:'Menlo','Consolas',monospace;word-break:break-all;">${escHtml(data.confirmationCode)}</div>
              </td>`
                  : `<td width="49%">&nbsp;</td>`
              }
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 8px 32px;">
          <h2 style="margin:0;font-size:17px;font-weight:700;color:#0f2e1f;">Co dalej?</h2>
          <ul style="margin:10px 0 0 0;padding-left:20px;font-size:14px;line-height:1.65;color:#27483b;">
            <li>Zachowaj tego maila — przyda się przy meldowaniu w hotelu.</li>
            <li>Hotel może poprosić o dokument tożsamości oraz kartę użytą do płatności.</li>
            <li>Standardowa godzina meldowania to zwykle ok. 15:00, a wymeldowania 11:00 (warto sprawdzić u hotelu).</li>
            <li>W razie pytań napisz do nas na <a href="mailto:${escHtml(data.supportEmail)}" style="color:#047857;font-weight:600;text-decoration:underline;">${escHtml(data.supportEmail)}</a> — podaj numer ${escHtml(data.bookingId)}.</li>
          </ul>
        </td></tr>

        <tr><td style="padding:14px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
            <tr><td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#704306;">
              <strong>Zmiana lub anulowanie?</strong> Warunki zależą od pakietu wybranego przy rezerwacji. Aby zmienić termin lub anulować pobyt — odpisz na tego maila lub napisz na ${escHtml(data.supportEmail)} możliwie najszybciej, podając numer ${escHtml(data.bookingId)}.
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#27483b;">Dziękujemy, że wybrałeś HelpTravel. Życzymy udanego wyjazdu.</p>
        </td></tr>

        <tr><td style="padding:18px 32px 28px 32px;border-top:1px solid #e3eee8;font-size:12px;line-height:1.6;color:#5b7066;">
          <div>
            HelpTravel ·
            <a href="${escHtml(siteUrl)}/regulamin" style="color:#3b5d4d;text-decoration:underline;">Regulamin</a> ·
            <a href="${escHtml(siteUrl)}/polityka-prywatnosci" style="color:#3b5d4d;text-decoration:underline;">Polityka prywatności</a> ·
            <a href="${escHtml(siteUrl)}/linki-partnerskie" style="color:#3b5d4d;text-decoration:underline;">Linki partnerskie</a>
          </div>
          <div style="margin-top:8px;">
            Ten e-mail został wysłany na adres ${escHtml(data.holder.email)} ponieważ wykonałeś rezerwację w HelpTravel. Nie jest to wiadomość marketingowa.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines: (string | null)[] = [
    `Rezerwacja potwierdzona`,
    `Numer: ${data.bookingId}`,
    ``,
    `Cześć ${data.holder.firstName},`,
    ``,
    `Dziękujemy za rezerwację. Szczegóły do meldowania:`,
    ``,
    `Hotel: ${data.hotelName}${data.city ? `, ${data.city}` : ""}`,
    `Przyjazd: ${checkinFmt}`,
    `Wyjazd: ${checkoutFmt}`,
    `Długość pobytu: ${plNights(nights)}`,
    `Goście: ${plGuests(data.guestCount)}`,
    data.boardName ? `Pakiet: ${data.boardName}` : null,
    moneyFmt ? `Kwota zapłacona: ${moneyFmt}` : null,
    ``,
    `Numer rezerwacji w HelpTravel: ${data.bookingId}`,
    data.confirmationCode ? `Numer rezerwacji w hotelu: ${data.confirmationCode}` : null,
    ``,
    `Co dalej?`,
    `- Zachowaj tego maila — przyda się przy meldowaniu w hotelu.`,
    `- Hotel może poprosić o dokument tożsamości i kartę użytą do płatności.`,
    `- Standardowa godzina meldowania to zwykle ok. 15:00, a wymeldowania 11:00.`,
    `- W razie pytań: ${data.supportEmail}`,
    ``,
    `Zmiana lub anulowanie? Warunki zależą od pakietu. Odpisz na tego maila lub napisz na ${data.supportEmail}, podając numer ${data.bookingId}.`,
    ``,
    `Dziękujemy, że wybrałeś HelpTravel.`,
    ``,
    `--`,
    `Regulamin: ${siteUrl}/regulamin`,
    `Polityka prywatności: ${siteUrl}/polityka-prywatnosci`,
    `Linki partnerskie: ${siteUrl}/linki-partnerskie`,
  ];

  const text = textLines.filter((l): l is string => l !== null).join("\n");

  return { subject, html, text };
}
