// Szablony e-maili sagi pakietowej (PL) — resume / refund / confirmation.
// Te same reguły co booking-confirmation.ts: inline CSS, layout tabelkowy,
// max 600px, wariant plain-text OBOWIĄZKOWY, preheader, escHtml na danych.
// Treść = wyłącznie fakty z sagi (dwa numery, deadline, descriptor NUITEE) —
// zero marketingowego szumu w mailach transakcyjnych.

import { getSiteUrl } from "@/lib/mvp/site";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Fakty do maili — rekord sagi + (opcjonalnie) kontekst oferty z offerJson. */
export interface PackageEmailData {
  sagaId: string;
  hotelName?: string | null;
  destination?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  hotelBookingId?: string | null;
  flightBookingId?: string | null;
  /** ISO — tylko resume (okno dokończenia płatności za lot). */
  deadlineAt?: string | null;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(d);
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const stamp = iso.length === 10 ? `${iso}T12:00:00Z` : iso;
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "Europe/Warsaw" }).format(d);
}

/** Linia „Hotel Arts · Barcelona · 10–14 sierpnia" z dostępnych faktów. */
function tripLine(d: PackageEmailData): string {
  const parts = [d.hotelName, d.destination].filter(Boolean) as string[];
  const dates = d.dateFrom && d.dateTo ? `${fmtDay(d.dateFrom)} – ${fmtDay(d.dateTo)}` : "";
  return [...parts, dates].filter(Boolean).join(" · ");
}

/** Wspólna koperta HTML (tabelka 600px, akcent emerald, stopka helptravel). */
function wrap(args: { preheader: string; heading: string; bodyHtml: string; cta?: { label: string; href: string } }): string {
  const cta = args.cta
    ? `<tr><td align="center" style="padding:8px 0 20px;">
         <a href="${escHtml(args.cta.href)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:10px;">${escHtml(args.cta.label)}</a>
       </td></tr>`
    : "";
  return `<!doctype html><html lang="pl"><body style="margin:0;padding:0;background:#f5f7f6;">
  <span style="display:none;max-height:0;overflow:hidden;">${escHtml(args.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f6;padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
      <tr><td style="background:#065f46;padding:18px 28px;">
        <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.4px;">HelpTravel</span>
        <span style="color:#a7f3d0;font-size:12px;"> · pakiety Lot + Hotel</span>
      </td></tr>
      <tr><td style="padding:26px 28px 6px;">
        <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#111827;">${args.heading}</h1>
      </td></tr>
      <tr><td style="padding:0 28px 8px;color:#374151;font-size:14px;line-height:1.65;">${args.bodyHtml}</td></tr>
      ${cta}
      <tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;line-height:1.6;">
        Płatności obsługuje NUITEE TRAVEL — operator płatności helptravel.pl (tak opisane pozycje zobaczysz na wyciągu).
        Masz pytanie? Po prostu odpisz na tę wiadomość.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** Kafelek z numerem rezerwacji (dwa osobne — dwie usługi, dwa potwierdzenia). */
function idBox(label: string, value: string | null | undefined, fallback = "—"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0;"><tr>
    <td style="background:#ecfdf5;border-radius:10px;padding:10px 14px;">
      <span style="display:block;color:#065f46;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">${escHtml(label)}</span>
      <span style="display:block;color:#064e3b;font-size:14px;font-weight:700;word-break:break-all;">${escHtml(value || fallback)}</span>
    </td></tr></table>`;
}

/** „Hotel potwierdzony — dokończ rezerwację lotu" (natychmiast po Checkout 1). */
export function renderPackageResumeEmail(d: PackageEmailData): RenderedEmail {
  const site = getSiteUrl();
  const resumeUrl = `${site}/pakiety/checkout?saga=${encodeURIComponent(d.sagaId)}&step=flight`;
  const trip = tripLine(d);
  const deadline = fmtWhen(d.deadlineAt);
  const subject = "Hotel potwierdzony — dokończ rezerwację lotu";
  const text = [
    "Twój hotel jest potwierdzony i opłacony.",
    ...(trip ? [trip] : []),
    `Została jeszcze płatność za lot — dokończ ją do ${deadline}, potem rezerwację automatycznie anulujemy i zwrócimy pełną kwotę za hotel.`,
    "",
    `Wróć do rezerwacji: ${resumeUrl}`,
    "",
    "Zespół helptravel.pl",
  ].join("\n");
  const html = wrap({
    preheader: `Dokończ płatność za lot do ${deadline} — hotel już czeka.`,
    heading: "Hotel potwierdzony ✓ — została płatność za lot",
    bodyHtml: `
      ${trip ? `<p style="margin:0 0 10px;"><strong>${escHtml(trip)}</strong></p>` : ""}
      <p style="margin:0 0 10px;">Twój hotel jest opłacony i potwierdzony. Żeby domknąć pakiet, dokończ płatność za lot.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;"><tr>
        <td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:10px 14px;color:#92400e;font-size:13px;">
          Masz czas do <strong>${escHtml(deadline)}</strong>. Po tym terminie automatycznie anulujemy hotel
          (bezpłatna anulacja) i zwrócimy pełną kwotę — nic nie przepada.
        </td></tr></table>`,
    cta: { label: "Dokończ płatność za lot", href: resumeUrl },
  });
  return { subject, html, text };
}

/** „Rezerwacja anulowana — pełny zwrot w drodze" (deadline / decyzja klienta / fail booku). */
export function renderPackageRefundEmail(d: PackageEmailData): RenderedEmail {
  const trip = tripLine(d);
  const subject = "Rezerwacja anulowana — pełny zwrot w drodze";
  const text = [
    "Twoja rezerwacja pakietu została anulowana zgodnie z zasadami (hotel miał bezpłatną anulację).",
    ...(trip ? [trip] : []),
    "Pełny zwrot wpłaconej kwoty jest w drodze — na wyciągu zobaczysz go od NUITEE TRAVEL, operatora płatności helptravel.pl.",
    "",
    "Jeśli coś się nie zgadza, po prostu odpisz na tę wiadomość.",
    "",
    "Zespół helptravel.pl",
  ].join("\n");
  const html = wrap({
    preheader: "Pełny zwrot płatności jest w drodze.",
    heading: "Rezerwacja anulowana — zwrot w drodze",
    bodyHtml: `
      ${trip ? `<p style="margin:0 0 10px;"><strong>${escHtml(trip)}</strong></p>` : ""}
      <p style="margin:0 0 10px;">Rezerwacja pakietu została anulowana zgodnie z zasadami — hotel miał
      bezpłatną anulację, więc <strong>zwracamy pełną wpłaconą kwotę</strong>.</p>
      <p style="margin:0;">Zwrot zobaczysz na wyciągu jako <strong>NUITEE TRAVEL</strong>. Czas księgowania
      zależy od banku (zwykle 3–7 dni roboczych).</p>`,
  });
  return { subject, html, text };
}

/** Potwierdzenie pakietu — DWA numery rezerwacji, wyraźnie oddzielone. */
export function renderPackageConfirmationEmail(d: PackageEmailData): RenderedEmail {
  const site = getSiteUrl();
  const statusUrl = `${site}/pakiety/rezerwacja/${encodeURIComponent(d.sagaId)}`;
  const trip = tripLine(d);
  const subject = "Potwierdzenie pakietu — hotel + lot";
  const text = [
    "Twój pakiet jest potwierdzony. Dwie rezerwacje, dwa numery:",
    `• Hotel: ${d.hotelBookingId ?? "—"}`,
    `• Lot: ${d.flightBookingId ?? "—"}`,
    ...(trip ? ["", trip] : []),
    "",
    `Szczegóły i status: ${statusUrl}`,
    "",
    "Zespół helptravel.pl",
  ].join("\n");
  const html = wrap({
    preheader: "Hotel i lot potwierdzone — dwa numery rezerwacji w środku.",
    heading: "Pakiet potwierdzony 🎉",
    bodyHtml: `
      ${trip ? `<p style="margin:0 0 10px;"><strong>${escHtml(trip)}</strong></p>` : ""}
      <p style="margin:0 0 6px;">Rezerwujesz dwie powiązane usługi, więc dostajesz dwa numery — oba
      znajdziesz też na stronie statusu:</p>
      ${idBox("Rezerwacja hotelu", d.hotelBookingId)}
      ${idBox("Rezerwacja lotu", d.flightBookingId, "wystawiamy bilet — numer w osobnym e-mailu")}
      <p style="margin:10px 0 0;font-size:12px;color:#6b7280;">Lot po zakupie jest bezzwrotny; zasady anulacji
      hotelu znajdziesz w szczegółach rezerwacji.</p>`,
    cta: { label: "Zobacz status rezerwacji", href: statusUrl },
  });
  return { subject, html, text };
}
