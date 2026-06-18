// FAZA 2 — filtr sprzeczności + prawie-duplikatów w liście udogodnień.
//
// LiteAPI/Cupid potrafi zwrócić JEDNOCZEŚNIE „Accessible shuttle" i „No
// accessible shuttle" (oba z ptaszkiem ✓), albo „Accessible train station
// shuttle" i jego zaprzeczenie — to natychmiastowy dowód zepsutych danych,
// który zabija zaufanie tuż przed checkoutem.
//
// Reguła (z promptu): wariant „No X" NIGDY nie jest pokazywany:
//   • para X / „No X"  → zostaje tylko pozytyw (X), negatyw kasujemy;
//   • samotne „No X"   → też kasujemy (brak udogodnienia = po prostu go nie
//     wymieniamy; lista mówi co hotel MA, nie czego nie ma).
// Dodatkowo: dedup prawie-identycznych (case/spacja/interpunkcja) i wycięcie
// pustych/nonsensownych wpisów.
//
// Uruchamiane na SUROWEJ (angielskiej) liście, PRZED lokalizacją i grupowaniem
// — `groupFacilities` dostaje już oczyszczone dane.

// Klucz porównawczy: wyłącznie znaki alfanumeryczne (PL+EN), lowercase. Scala
// „Free WiFi" / „Free Wi-Fi" / „free wifi" → jeden wpis.
function dedupeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/gi, "");
}

// Frazy zaczynające się od „No ...", które są w istocie POZYTYWNE (gwarancje
// bez opłat) — tych NIE usuwamy.
const POSITIVE_NO = [
  "no deposit",
  "no booking fee",
  "no reservation fee",
  "no hidden",
  "no prepayment",
  "no prepay",
  "no cancellation fee",
  "no charge",
  "no extra charge",
  "no service fee",
];

/** Czy facility to zaprzeczenie („No X") — z pominięciem pozytywnych „No opłat". */
export function isNegativeFacility(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (!/^no\s/.test(t)) return false; // wymaga „no " ze spacją (nie złapie „Non-smoking")
  return !POSITIVE_NO.some((p) => t.startsWith(p));
}

/** Oczyść listę facility: usuń „No X", prawie-duplikaty i puste/nonsensowne. */
export function sanitizeFacilities(list: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const s = (raw ?? "").trim();
    if (!s) continue; // puste
    if (isNegativeFacility(s)) continue; // „No X" — sprzeczność/brak
    const key = dedupeKey(s);
    if (!key) continue; // nonsens (same symbole/interpunkcja)
    if (seen.has(key)) continue; // prawie-duplikat
    seen.add(key);
    out.push(s);
  }
  return out;
}
