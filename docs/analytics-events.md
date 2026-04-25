# HelpTravel analytics events

Ten dokument opisuje podstawowe eventy po stronie klienta, ktore mierza najwazniejsze ruchy w publicznym UX serwisu.

## Hero i wejscie do planera

- `hero_cta_clicked`
  - kiedy: klik w glowne CTA w hero
  - payload: `mode`, opcjonalnie `query`
  - po co: mierzy, czy uzytkownik startuje od kierunku czy od pomocy w wyborze

- `planner_mode_selected`
  - kiedy: przelaczenie trybu `Mam kierunek` / `Pomoz mi wybrac`
  - payload: `source`, `mode`
  - po co: mierzy, ktory tryb jest dla uzytkownika bardziej naturalnym startem

- `planner_submitted`
  - kiedy: wyslanie glownego formularza planera
  - payload: `mode`, `queryLength`, `hasBudget`, `hasStartDate`, `hasEndDate`, `travelers`, `origin`
  - po co: mierzy realne uzycie glownego formularza i jak wygladaja najczestsze wejscia

## Powroty i retencja

- `saved_plan_clicked`
  - kiedy: klik w zapisany plan
  - payload: `tripId`, `source`
  - po co: mierzy powroty do zapisanych scenariuszy

- `planner_restored`
  - kiedy: przywrocenie ostatnich ustawien planera
  - payload: `source`
  - po co: pokazuje, czy warstwa retencji jest faktycznie uzywana

- `search_saved`
  - kiedy: zapisanie wyszukiwania
  - payload: zalezne od miejsca zapisu
  - po co: mierzy, czy uzytkownik chce wracac do ustawien

- `destination_saved`
  - kiedy: zapisanie kierunku
  - payload: `slug`, `city`, `country`
  - po co: mierzy shortlisty i intencje powrotu

- `comparison_selected`
  - kiedy: klik w alternatywny kierunek w porownaniu
  - payload: `slug`, `city`, `source`
  - po co: pokazuje, jak czesto uzytkownik porownuje zamiast od razu przejsc dalej

## Karty tresci i kierunkow

- `destination_card_clicked`
  - kiedy: klik w karte kierunku lub jej CTA
  - payload: `slug`, `city`, `action`, `source`, `locale`
  - akcje:
    - `guide`
    - `planner`
  - po co: mierzy, czy karta ma bardziej role inspiracji czy wejscia do planera

- `content_card_clicked`
  - kiedy: klik w karte artykulu lub jej CTA
  - payload: `slug`, `title`, `action`, `source`
  - akcje:
    - `open`
    - `cta`
  - po co: mierzy, czy artykuly sa czytane i czy domykaja przejscie dalej

## Kontakt

- `contact_submit`
  - kiedy: wyslanie formularza kontaktowego
  - payload: `topic`, `hasReplyEmail`, `hasUrl`, `source`
  - po co: mierzy, jakie sprawy przewazaja i czy formularz jest uzyteczny

## Partnerzy i klik wyjsciowy

- `affiliate_clicked`
  - kiedy: klik w link do partnera
  - payload: zalezne od miejsca klikniecia i providera
  - po co: mierzy przejscie z inspiracji i planowania do finalnego kroku u partnera

## Uwagi

- Publiczny przelacznik jezyka EN jest tymczasowo ukryty, wiec nie mierzymy teraz osobnego eventu przejscia PL/EN w glownym UX.
- Eventy maja byc nazywane prosto i konsekwentnie, bez mieszania warstwy produktu z nazewnictwem technicznym.
