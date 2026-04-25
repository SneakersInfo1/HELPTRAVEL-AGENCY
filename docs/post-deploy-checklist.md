# HelpTravel post-deploy checklist

## Production checks
- Open the homepage and confirm the hero has one clear value proposition.
- Open `/planner` and confirm the first screen is not overloaded.
- Open `/kierunki` and confirm the catalog copy is human and simple.
- Open one destination page and confirm it does not feel template-like.
- Open `/kontakt` and confirm there is a visible, practical way to reach the team.
- Open `/dla-partnerow` and confirm the page stays transparent and non-deck-like.
- Open `/faq`, `/cennik`, `/oferta`, `/o-nas`, `/jak-pracujemy` and confirm metadata and copy are clean.

## Indexing checks
- Confirm `/sitemap.xml` does not include public `/en/*` URLs.
- Confirm `/en/*` is not publicly accessible as a second language surface.
- Confirm the main public pages are indexable.
- Confirm `robots.txt` and canonical tags still point to the PL experience.

## UX and copy checks
- Confirm there is no internal product language in the public UI.
- Confirm public copy uses Polish diacritics.
- Confirm planner saved plans are not shown too early.
- Confirm destination pages still explain who the trip is for, when it works and when it does not.

## Accessibility checks
- Confirm the visible locale and routing state are consistent.
- Confirm headings, labels and buttons still work with keyboard navigation.
- Confirm the contact form and planner inputs keep visible focus states.

## Validation commands
```bash
pnpm lint
pnpm test
pnpm build
```

