\# HelpTravel — Active Context (live)



\## Status

\- Phase 0: ✅ INTEGRATION\_PLAN.md approved with 4 owner corrections

\- Phase 1: ✅ LiteAPI client + smoke chain verified, Payments active

\- Phase 2-3: 🟡 IN PROGRESS — Hotel Search UX + Hotel Detail

\- Phase 4-9: pending



\## Key proven facts

\- LiteAPI Payments active (transactionId + secretKey returned by prebook)

\- offerId is at roomType level (not rate level) — feeds prebook

\- LiteAPI uses single base URL api.liteapi.travel + book.liteapi.travel

\- Field naming drift exists in LiteAPI — contract tests cover all 7 endpoints



\## Operating model (final)

\- LiteAPI User Payment SDK — LiteAPI is merchant of record

\- Owner: PL działalność nierejestrowana, JDG trigger \~3499 PLN/mo

\- No Stripe/Adyen/Przelewy24 — LiteAPI hosted only

\- Discovery Planner: OpenRouter free tier with Anthropic emergency fallback



\## Reference docs (load only the section relevant to current task)

\- MASTER\_SPEC.md — full spec

\- INTEGRATION\_PLAN.md — Phase 0

\- PURGE\_REPORT.md — Phase 1 cleanup proof

\- FIXES\_LOG.md — hotfixes (URL, prebook offerId, book guests)

\- SECTION\_6\_OPENROUTER\_UPDATE.md — Phase 6 LLM provider chain

