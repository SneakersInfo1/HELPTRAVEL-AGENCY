-- Add foreign-key + frequently-filtered indexes across all models.
-- Postgres does NOT auto-index FK columns; every `findMany` filtered by
-- sessionId / tripRequestId / destinationId / eventType was doing a
-- sequential scan. Audit 2026-05-26 (PR #61) flagged this.
--
-- All indexes use IF NOT EXISTS so re-runs are safe (Prisma migrate deploy
-- is idempotent for declarative schema changes, but explicit guards help
-- if any environment has been manually indexed).

-- AnonymousSession
CREATE INDEX IF NOT EXISTS "AnonymousSession_createdAt_idx" ON "AnonymousSession"("createdAt");
CREATE INDEX IF NOT EXISTS "AnonymousSession_lastSeenAt_idx" ON "AnonymousSession"("lastSeenAt");

-- TripRequest
CREATE INDEX IF NOT EXISTS "TripRequest_sessionId_idx" ON "TripRequest"("sessionId");
CREATE INDEX IF NOT EXISTS "TripRequest_createdAt_idx" ON "TripRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "TripRequest_mode_idx" ON "TripRequest"("mode");

-- Destination
CREATE INDEX IF NOT EXISTS "Destination_country_idx" ON "Destination"("country");
CREATE INDEX IF NOT EXISTS "Destination_visaForPL_idx" ON "Destination"("visaForPL");

-- DestinationScore — single-column FK indexes + a compound index for top-N
-- retrieval ("scores for trip X ordered by rank")
CREATE INDEX IF NOT EXISTS "DestinationScore_tripRequestId_idx" ON "DestinationScore"("tripRequestId");
CREATE INDEX IF NOT EXISTS "DestinationScore_destinationId_idx" ON "DestinationScore"("destinationId");
CREATE INDEX IF NOT EXISTS "DestinationScore_tripRequestId_rank_idx" ON "DestinationScore"("tripRequestId", "rank");

-- ItineraryResult
CREATE INDEX IF NOT EXISTS "ItineraryResult_tripRequestId_idx" ON "ItineraryResult"("tripRequestId");
CREATE INDEX IF NOT EXISTS "ItineraryResult_destinationId_idx" ON "ItineraryResult"("destinationId");

-- SavedTrip — FK columns + compound index for "user's saved trips, newest first"
CREATE INDEX IF NOT EXISTS "SavedTrip_sessionId_idx" ON "SavedTrip"("sessionId");
CREATE INDEX IF NOT EXISTS "SavedTrip_itineraryResultId_idx" ON "SavedTrip"("itineraryResultId");
CREATE INDEX IF NOT EXISTS "SavedTrip_sessionId_createdAt_idx" ON "SavedTrip"("sessionId", "createdAt");

-- AffiliateClick — FK columns + frequently-filtered (provider, createdAt)
CREATE INDEX IF NOT EXISTS "AffiliateClick_sessionId_idx" ON "AffiliateClick"("sessionId");
CREATE INDEX IF NOT EXISTS "AffiliateClick_itineraryResultId_idx" ON "AffiliateClick"("itineraryResultId");
CREATE INDEX IF NOT EXISTS "AffiliateClick_provider_idx" ON "AffiliateClick"("provider");
CREATE INDEX IF NOT EXISTS "AffiliateClick_createdAt_idx" ON "AffiliateClick"("createdAt");

-- Event — FK + frequently-filtered + compound for "events of type X over time"
CREATE INDEX IF NOT EXISTS "Event_sessionId_idx" ON "Event"("sessionId");
CREATE INDEX IF NOT EXISTS "Event_eventType_idx" ON "Event"("eventType");
CREATE INDEX IF NOT EXISTS "Event_createdAt_idx" ON "Event"("createdAt");
CREATE INDEX IF NOT EXISTS "Event_eventType_createdAt_idx" ON "Event"("eventType", "createdAt");
