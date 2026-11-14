---
name: helptravel-design-identity
description: Tożsamość wizualna stron treściowych helptravel.pl (porównania kierunków, przewodniki miesięczne, huby „wyjazdy”, artykuły) — spokojny redakcyjny charakter „redakcji, która policzyła”, bez wyglądu z generatora AI. Użyj ZAWSZE, gdy projektujesz, zmieniasz albo oceniasz wygląd strony treściowej, sekcji, werdyktu, tabeli faktów, karty, CTA, zdjęć czy typografii; gdy oceniasz propozycję z 21st.dev, UI UX Pro Max albo Frontend Design; gdy ktoś pyta „czy to wygląda jak AI”, „dopracuj wygląd porównania”, „nowy szablon artykułu”, „tabela nie mieści się na telefonie”. Uzupełnia `helptravel-design-system` (jakie wartości tokenów) i `helptravel-conversion-checklist` (czy sekcja sprzedaje) — ten skill mówi, jaki charakter ma strona i czego nie robić.
---

# Tożsamość wizualna treści HelpTravel

HelpTravel sprzedaje hotele i loty, ale na strony treściowe ludzie trafiają z Google z pytaniem: „Ateny czy Rzym?”, „Barcelona w styczniu?”. Strona ma najpierw odpowiedzieć, a dopiero potem sprzedać. Charakter to redakcja, która coś policzyła i podaje źródła, a nie biuro podróży z banerami. 90% ruchu to telefon, więc każda decyzja zaczyna się od 390 px.

## 1. Z czego składa się marka (nie wymyślaj nowych wartości)

Wartości bierz z `src/app/globals.css` (`@theme`) i skilla `helptravel-design-system`. Nie wpisuj hexów ręcznie.

- **Kolory:** `brand`, `brand-strong` i `brand-soft` (szmaragd), `accent` i `accent-bright` (oszczędnie), `ink` i `ink-muted` (tekst), `surface`, `surface-raised` i `surface-sunken` (tła), `line` (obramowania), a do tego `success`, `warning` i `error` tylko do stanów.
- **Typografia:** Cormorant Garamond (`font-display`) do nagłówków i werdyktu, z umiarem: H1, H2 i cytat werdyktu, nigdy tekst ciągły. Manrope (`font-sans`) do treści, tabel i interfejsu. Liczby w tabelach piszemy Manrope, bo szeryf z niskim kontrastem słabo się czyta w cyfrach.
- **Promienie i cienie:** `rounded-sm`, `rounded-md` i `rounded-lg` z tokenów. Pułapka: `rounded-lg` to 20 px, czyli więcej niż `rounded-2xl` (16 px). Cień `shadow-sm` lub `shadow-md`, bez kolorowych poświat.
- **Zdjęcia:** prawdziwe zdjęcia miejsca (Pexels z podpisem autora) albo żadne. Nie używamy stockowych „szczęśliwych turystów” ani obrazów generowanych. `object-cover` na wąskiej karcie wymaga `sizes` × proporcja, inaczej zdjęcie jest powiększane i rozmyte.

## 2. Element charakterystyczny: werdykt

Na stronie porównania pamięta się jedną rzecz: dwie kolumny „{miasto} — wybierz, jeśli”. Pod nimi stoi tabela faktów ze źródłami i datą sprawdzenia. To jedyne miejsce, gdzie szablon pozwala sobie na wyrazistość: szeryf, większy stopień pisma, szmaragdowy akcent. Wszystko wokół jest ciche. W przewodniku miesięcznym tę rolę pełni odpowiedź pod H1 („na co ten termin / kiedy odpuścić”) z jawną podstawą. W hubie jest to tabela faktów z bramki danych.

Komponenty: `src/components/editorial/comparison-blocks.tsx` (`VerdictColumns`, `FactTable`, `SourcesNote`, `DualHotelCta`), `comparison-template.tsx`, `month-template.tsx` i `src/components/publisher/mood-landing.tsx`.

## 3. Czego nie robimy — i dlaczego

Każdy z tych wzorców sprawia, że strona wygląda na wygenerowaną albo na nachalną sprzedaż. Każdy był już proponowany przez narzędzia inspiracji:

- **Gradienty, „aurora”, mesh, glassmorphism i poświaty.** Nie niosą informacji, gryzą się z szmaragdem marki i obniżają kontrast tekstu.
- **Emoji jako ikony 🏛️🍝🌊.** Na Androidzie i iOS wyglądają inaczej i źle brzmią w czytnikach ekranu. Jeśli ikona jest potrzebna, bierzemy SVG z tej samej rodziny co reszta serwisu.
- **Numeracja 01 / 02 / 03, gdy treść nie jest sekwencją.** Struktura ma mówić prawdę o treści. Numerujemy tylko plan dni albo kroki procesu.
- **Siatka identycznych kart powtórzona N razy.** Porównanie to tabela, a nie sześć kafli z ikonką i trzema słowami.
- **Wiele CTA.** Na ekranie jest jedna decyzja. Na porównaniu to para równorzędnych przycisków „Hotele: {miasto}”, po jednym na miasto (`DualHotelCta`), bo czytelnik wybiera między dwoma kierunkami. Na pozostałych stronach to jedno główne wezwanie i najwyżej jedno pomocnicze. Trzeciego i czwartego przycisku obok nie dokładamy, a linki do lotów czy przewodników schodzą niżej jako zwykłe linki. Każde CTA wynika z treści nad nim.
- **Fałszywa presja.** Liczniki, „-30% tylko dziś”, „ostatnie miejsca”, odznaki „Hit” i „Top wybór” bez danych. To ryzyko prawne (UOKiK) i podważa zaufanie, na którym stoi cała treść.
- **Ozdobne statystyki** („1000+ kierunków”, „98% zadowolonych”), jeśli nie pochodzą z mierzalnego źródła w repo.
- **Domyślne „looki AI”:** kremowe tło z terakotą, czarne tło z kwasową zielenią i gazetowe linie włoskowe bez promieni w każdej sekcji. Nasz szeryf i cienka linia pod H1 są w porządku, bo marka już ich używa. Pułapką jest dokładanie kolejnych linii i kolumn „dla klimatu”.

## 4. Układ i jakość podstawowa

- **Odpowiedź nad zgięciem na 390 px.** Kolejność to okruszki, H1, odpowiedź i dopiero potem zdjęcia. Baner cookies zakrywa dół ekranu przy pierwszej wizycie, więc kluczowa odpowiedź musi być nad nim.
- **Tabele na telefonie zamieniają się w bloki, a strona nie przewija się w poziomie.** Wiersz staje się kartą: kryterium jako nagłówek, wartości pod spodem, źródło widoczne. Role ARIA (`table`, `row`, `cell`) zostają, żeby czytnik ekranu dalej widział tabelę. Wzorzec jest w `FactTable`.
- **Cele dotykowe mają co najmniej 44 px**, fokus jest widoczny, a `prefers-reduced-motion` jest respektowany. Kontrast tekstu wynosi co najmniej 4,5:1, a `ink-muted` sprawdzaj na tle `surface-sunken`.
- **Elementy przyklejone nie zasłaniają banera cookies ani dymka czatu.** Dymek czatu jest jedynym elementem pływającym, nie dokładaj drugiego.
- **Obrazy leniwe mają wymiary albo kontener o stałych proporcjach.** Brak wymiarów to przesunięcia układu (CLS).

## 5. Proces

1. **Plan:** paleta i typografia z tokenów, jeden element charakterystyczny, szkic układu 390 i 1440 px. Sprawdź, czy plan nie jest odpowiedzią, którą dałbyś każdemu serwisowi turystycznemu. Jeśli jest, zmień go.
2. **Laboratorium przed produkcją:** warianty buduj pod `/lab/porownanie/[wariant]/[para]`. Trasa działa tylko z `SEO_LAB=1`, ma noindex i zwraca 404 na produkcji. Nie wdrażaj trzech kierunków naraz.
3. **QA:**
   - `pnpm seo:shots -- --base http://localhost:3000 --label po --paths <ścieżki>` robi zrzuty w szerokościach 390, 768 i 1440 i zapisuje raport konsoli oraz przepełnień;
   - `pnpm exec playwright test e2e/seo-templates.spec.ts` sprawdza układ, fokus, CTA i axe;
   - `pnpm lighthouse -- --routes=<ścieżki>` mierzy LCP, CLS i dostępność.
4. **Autokrytyka:** przed oddaniem usuń jeden ozdobnik. Jeśli strona bez niego mówi to samo, nie był potrzebny.

## 6. Ocena cudzej propozycji (21st.dev, UI UX Pro Max, Frontend Design)

Z inspiracji bierz wzorce strukturalne i reguły dostępności: układ tabel na telefonie, kolejność informacji, stany fokusu. Nigdy nie bierz palety, fontów ani stylu wizualnego w całości. Zmiana fontu albo koloru marki to decyzja właściciela, a każdy dodatkowy font to koszt LCP. Zapisz, co przyjęto, a co odrzucono i dlaczego, w `docs/seo/DESIGN_QUALITY_STANDARD.md`. Nie uruchamiaj płatnej generacji komponentów bez zgody.

## 7. Format odpowiedzi

```
Werdykt: <ACCEPT | REVISE | REJECT>
Zgodne z tożsamością: …
Do zmiany (z powodem i propozycją na tokenach): …
Odrzucone wzorce: …
QA do wykonania: <polecenia z pkt 5>
```

Wiersz „QA do wykonania” wypełniaj zawsze, także gdy tylko doradzasz i niczego nie zmieniasz. Podaj konkretne polecenia i szerokości (390, 768, 1440), bo to one odróżniają „wygląda dobrze” od „sprawdzone”.
