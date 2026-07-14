-- Saga pakietów Lot + Hotel (Faza 2, spec §3.4) — stan w Postgresie.
-- Wygenerowane `prisma migrate diff` (offline; lokalny DATABASE_URL to
-- placeholder). Deploy: `prisma migrate deploy` po ustawieniu DATABASE_URL
-- na Vercel PROD — bramka wejścia Fazy 2 (docs/PACKAGES_DECISIONS.md).

-- CreateEnum
CREATE TYPE "PackageSagaState" AS ENUM ('DRAFT', 'FLIGHT_HELD', 'HOTEL_PREBOOKED', 'HOTEL_PAID', 'HOTEL_BOOKED_AWAITING_FLIGHT', 'FLIGHT_PAID', 'FLIGHT_BOOKED', 'CONFIRMED', 'CANCELLED', 'COMPENSATING', 'REFUNDED', 'NEEDS_MANUAL_ACTION');

-- CreateTable
CREATE TABLE "PackageBooking" (
    "id" TEXT NOT NULL,
    "sagaState" "PackageSagaState" NOT NULL DEFAULT 'DRAFT',
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "flightPrebookId" TEXT,
    "flightBookingId" TEXT,
    "hotelPrebookId" TEXT,
    "hotelBookingId" TEXT,
    "txnHotel" TEXT,
    "txnFlight" TEXT,
    "txnFlightHistoryJson" JSONB,
    "prebookExpiresAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "stateLogJson" JSONB,
    "compensationLogJson" JSONB,
    "offerJson" JSONB,
    "contactEmail" TEXT,
    "amountHotelMinor" INTEGER,
    "amountFlightMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageBooking_sagaState_deadlineAt_idx" ON "PackageBooking"("sagaState", "deadlineAt");

-- CreateIndex
CREATE INDEX "PackageBooking_createdAt_idx" ON "PackageBooking"("createdAt");
