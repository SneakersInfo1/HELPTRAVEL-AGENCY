# HelpTravel Launch Kit

Gotowe copy do wklejenia. Wszystko zostalo napisane pod konkretny kanal — nie kopiuj jednego do drugiego.

**Glowne URLe:**
- Strona: `https://helptravel.pl`
- UTM template: `?utm_source=<kanal>&utm_medium=<typ>&utm_campaign=launch-2026-04`

---

## 1. Reddit

### r/Polska — value-first, dyskusyjny

**Tytul:** Zrobilem narzedzie ktore w 3 min uklada wyjazd z lotem, hotelem i planem dnia. Co o tym myslicie?

```
Czesc, jestem z Polski i od pol roku robie HelpTravel — strone ktora ma rozwiazac jeden konkretny problem: jak ulozyc krotki wyjazd zagraniczny bez 40 zakladek w przegladarce.

Pomysl wzial sie z frustracji — za kazdym razem kiedy planowalem city break, ladowalem z 5 zakladkami Skyscannera, 3 Bookinga, mapa, blog z atrakcjami i excelem z budzetem. To zajmowalo wieczor.

Co robie inaczej:
- jeden formularz: skad, dokad, kiedy, ile osob, budzet
- wyniki: lot + hotel + krotki plan dnia (co zobaczyc, gdzie zjesc) na jednym ekranie
- 22 lotniska — Polska + europejskie hubu (dla tych ktorzy pracuja w UK/DE/IE)
- bez rejestracji, bez subskrypcji, korzystanie 0 zl (zarabiam na prowizji od partnerow gdy zarezerwujesz)

Co bym chcial od Was:
- co Was zlosci w obecnych planowarkach?
- czy w ogole macie potrzebe takiego narzedzia, czy juz zaakceptowaliscie 5 zakladek?

Link w komentarzu zeby nie wygladalo jak spam. Krytyka mile widziana.
```

W komentarzu: `https://helptravel.pl?utm_source=reddit&utm_medium=post&utm_campaign=launch-rpolska`

---

### r/podroze — bardziej praktyczny, podajacy konkret

**Tytul:** [Tool] HelpTravel — porownuje lot+hotel+plan dnia z 1 formularza (testowalem na 6 city breakach)

```
Cze, robie projekt HelpTravel.pl i chcialbym uslyszec opinie tej spolecznosci, bo wy wiecie najwiecej o real planowaniu.

Co to: jeden formularz (kierunek, daty, osoby) -> dostajesz lot, hotel, plan dnia. Bez zakladkowego ping-ponga.

Z czego zlozone:
- ceny lotow + hoteli z partnerow (Booking, Hotels.com, Aviasales, Kiwi)
- 22 lotniska wylotowe — PL i kluczowe EU
- ASCII bez diakrytyk (nie najpiekniej, ale dziala wszedzie)
- bez rejestracji

Czego mi brakuje a chcialbym dodac:
- last-minute deals tracking
- alerty cenowe na konkretna trase
- transfery z lotniska

Czy planujac wyjazd uzylibyscie czegos takiego? Co bym mial zmienic? Co dzialalo Wam najgorzej w innych planowarkach?

Link: https://helptravel.pl
```

---

### r/lotnictwo — bardziej techniczne, krotsze

**Tytul:** Zbudowalem porownywarke trasy lot+hotel z 22 lotnisk PL+EU (HelpTravel.pl)

```
Polski projekt — porownywarka lotow + hoteli z 22 lotnisk (Polska i hubu EU dla diaspory). Bez rejestracji, ceny z Aviasales/Kiwi/Booking.

Co cieszy mnie najbardziej: pierwsze ladowanie LCP <2.5s nawet na 4G — duzo czasu wlozylem w optymalizacje obrazkow i lazy loadingu hero.

Pytanie do tej grupy: jakich tras realnie szukacie? Mam dane z Krakowa/Warszawy, ale czy Lublin/Rzeszow/Szczecin tez ma sens?

Link: https://helptravel.pl
```

---

## 2. Facebook — grupy podroznicze

### Grupy "Tanie Loty Polska", "City breaki", "Podroze marzen"

```
Hej! Robie polski serwis HelpTravel ktory porownuje LOT + HOTEL + UKLADA PLAN DNIA z jednego formularza. Pomysl wziol sie z tego ze sam mialem dosc otwierania 30 zakladek przed kazdym wyjazdem.

✈ 22 lotniska wylotowe (PL + EU)
🏨 Hotele od Bookinga / Hotels.com
📅 Plan dnia: co zobaczyc, gdzie zjesc
💰 Korzystanie darmowe — placisz tylko za rezerwacje u partnera

Test: wpiszcie kierunek o ktorym marzycie — sprawdzcie czy macie wszystko czego potrzebujecie. Bede wdzieczny za feedback!

➜ https://helptravel.pl

(jakby cos nie dzialalo lub bylo nielogiczne — pisze do mnie, naprawie szybko)
```

---

## 3. Product Hunt

**Name:** HelpTravel
**Tagline (60 chars max):** Flight + hotel + day plan in 3 minutes. Free.
**Description (260 chars):**
> Plan a full short trip in 3 minutes — flight, hotel and a real day-by-day plan from a single form. 22 airports across Poland and Europe. No signup. Free to use, you only pay partners when you book. Built for people who hate juggling 40 browser tabs.

**Bullet points (5-7):**
- One form -> flight + hotel + day-by-day plan
- 22 airports in Poland and Europe (great for Polish diaspora)
- Real-time price comparison (Booking, Hotels.com, Aviasales, Kiwi)
- No signup. No subscription. 100% free.
- Ready in <3 minutes vs typical 30 minutes of tab-juggling
- Mobile-first design with sub-2.5s LCP
- Day plans curated for short city breaks

**Comments thread starter:**
> Hi PH! I built HelpTravel after planning my fifth city break with 40 browser tabs and a chaotic spreadsheet. The current state of trip planning is broken — Booking shows you a hotel, Skyscanner shows you a flight, and you stitch them together yourself.
>
> HelpTravel does that stitching for you in 3 minutes. Curious to hear what features you'd want next — alerts? group splits? something else?

---

## 4. Hacker News — Show HN

**Title:** Show HN: HelpTravel – Flight + hotel + day plan from one form (Poland/EU)

**Body:**
```
Hi HN. I built HelpTravel.pl because every time I planned a short trip, I ended up with 40 browser tabs.

The site takes destination + dates + travelers and returns a flight, a hotel, and a basic day-by-day plan in one view. It compares partners (Booking, Hotels.com, Aviasales, Kiwi). Free to use, monetized via partner commission when you book.

Tech stack: Next.js 16, React 19, TypeScript strict, Tailwind 4, deployed on Vercel. SSR for SEO, ISR for destination pages, dynamic OG/favicon images via next/og ImageResponse.

Three things I'm proud of:
1. Sub-2.5s LCP on 4G even with cinematic hero (lazy-loading + cross-fade only renders current + next slide)
2. Type-safe deterministic "social proof" (FNV hash + ISO week — same number across SSR/CSR, evolves weekly)
3. Comprehensive schema.org graph (Organization, WebSite + SearchAction, Service, BreadcrumbList, FAQPage, Article, TouristDestination)

Pain points I'd love feedback on:
- Affiliate API rate limits (currently caching aggressively)
- How to balance "marketing flair" without crossing into dark patterns
- Polish vs international launch sequencing

Link: https://helptravel.pl
```

---

## 5. Twitter/X launch thread

### Polski

```
1/ Po pol roku — wlasnie wystartowalem HelpTravel.pl

Strona robi 1 rzecz dobrze: w 3 minuty uklada lot + hotel + plan dnia z jednego formularza.

Bez 40 zakladek. Bez rejestracji. Za 0 zl. 🧵

2/ Skad pomysl?

Za kazdym razem planujac city break ladowalem z 5 zakladkami Skyscannera, 3 Bookinga, mapa, blogiem i excelem.

Wieczor zmarnowany.

Pomyslalem: czemu to musi tyle trwac? 🤷

3/ Co robi inaczej:

✈ jeden formularz (skad/dokad/kiedy/osoby)
🏨 wyniki: lot + hotel + plan dnia w 1 widoku
🌍 22 lotniska (PL + EU, dla diaspory)
🆓 bez konta, korzystanie darmowe

Plac tylko gdy zarezerwujesz u partnera (Booking/Kiwi/Aviasales).

4/ Pod spodem:

Next.js 16, React 19, TypeScript strict, Tailwind 4, Vercel.

LCP <2.5s na 4G nawet z cinematic hero (lazy-load + cross-fade tylko aktualnego + nastepnego slidu).

Schema.org: Org/WebSite/Service/Breadcrumbs/FAQ/Article/TouristDestination.

5/ Test: wpiszcie miasto o ktorym marzycie i powiedzcie:

- czy znaleziscie wszystko czego potrzebujecie?
- co bylo nieintuicyjne?
- czego brakuje?

Krytyka >>> hejt. Naprawie szybko.

➜ https://helptravel.pl
```

### English

```
1/ Just shipped HelpTravel.pl — a tool I've been building for 6 months.

It does ONE thing well: in 3 minutes, plans a flight + hotel + day-by-day itinerary from a single form.

No 40 browser tabs. No signup. Free. 🧵

2/ The why:

Every time I planned a city break I ended up with 5 Skyscanner tabs, 3 Bookings, a map, a blog and a spreadsheet.

Wasted evening.

I wondered: why does this have to take so long?

3/ What's different:

✈ one form (from/to/when/who)
🏨 results: flight + hotel + day plan in one view
🌍 22 airports (PL + EU)
🆓 no account, free to use

You only pay partners when you book.

4/ Tech stack:

Next.js 16 · React 19 · TS strict · Tailwind 4 · Vercel
LCP <2.5s on 4G with a cinematic hero (lazy load + cross-fade)
Full schema.org graph for rich SERP

5/ Try it. Type a destination you're dreaming of and tell me:
- did you find everything?
- what was unintuitive?
- what's missing?

Brutal feedback welcome.

➜ https://helptravel.pl
```

---

## 6. Email pitch — travel bloggers

**Subject:** Quick ask: would you try HelpTravel and tell me what's broken?

```
Czesc {imie},

Czytam Twojego bloga {nazwa-bloga} od {liczba} miesiecy — szczegolnie wpis o {konkretny-wpis} mi sie spodobal.

Wlasnie wystartowalem HelpTravel.pl — porownywarke ktora w 3 min uklada lot + hotel + plan dnia z jednego formularza. Bez rejestracji, bez subskrypcji.

Wiem ze testujesz duzo narzedzi — czy moglbys rzucic okiem i powiedziec:
1. Co zadzialalo?
2. Co Cie zlosci?

Jesli ma sens — moge Ci dac wczesny dostep do alertow cenowych zanim wejdzie publicznie. Bez zobowiazan, bez wymaganej recenzji — szczerze chce Twojego feedbacku.

Link bez UTM: https://helptravel.pl

Dzieki!
{Twoje-imie}
```

---

## Sequence (jak wystrzelic wszystko w 1 tygodniu)

| Dzien | Kanal | Cel |
|---|---|---|
| 1 (wt) | Reddit r/polska + r/podroze | Polski ruch + dyskusja |
| 2 (sr) | FB grupy (3-5 grup) | Polski ruch + signal |
| 3 (czw) | Email do 10 blogerow | Backlinki + recenzje |
| 4 (pt) | Twitter/X PL thread | Polski tech crowd |
| 5 (sob) | — | Reaguj na feedback, pisz patche |
| 7 (pn) | Product Hunt + HN Show HN + Twitter EN | Globalny + tech ruch |

Po kazdym poscie: monitoruj GSC + GA4. Zapisuj co dzialalo, co nie.

---

## Co MUSI dzialac przed launchem

- [ ] Tracking eventow w analytics (mini_planner_submitted, affiliate_clicked)
- [ ] Mobile UX nie ma bugow (test na realnym telefonie)
- [ ] Strona laduje <3s na 4G
- [ ] Formularz zwraca wyniki w <5s
- [ ] Linki partnerskie maja prawidlowe UTM
- [ ] OG image renderuje sie poprawnie (test na FB debugger / opengraph.xyz)
- [ ] Backup planu B jak ktos zaleje serwer
