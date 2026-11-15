// Bezpieczny zapis JSON-LD do znacznika <script>.
//
// `JSON.stringify` nie ucieka znaku `<`, więc wartość zawierająca `</script>`
// zamyka blok i reszta staje się kodem strony. Dane do JSON-LD pochodzą już nie
// tylko z kodu: z dokumentów treści (tekst pisany przez model) i od dostawcy
// (nazwy hoteli). Zamiana na sekwencje \uXXXX daje ten sam JSON po sparsowaniu.

// Separatory linii i akapitu budujemy z kodów: wpisane dosłownie łamią literał w źródle.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const UNSAFE = new RegExp(`[<>&${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, "g");

const ESCAPES: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  [LINE_SEPARATOR]: "\\u2028",
  [PARAGRAPH_SEPARATOR]: "\\u2029",
};

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (char) => ESCAPES[char]);
}
