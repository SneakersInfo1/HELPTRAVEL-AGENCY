/* eslint-disable @typescript-eslint/no-explicit-any */
// Adapter Prisma dla SagaStore (model `PackageBooking`).
//
// ZASADA BEZPIECZEŃSTWA: saga trzyma stan REALNYCH pieniędzy — tu NIE MA
// cichego fallbacku in-memory jak w withPrismaFallback (spec §3.4: „Postgres,
// nie in-memory i nie tylko Redis"). Brak/placeholder DATABASE_URL ⇒ głośny
// wyjątek SagaStoreUnavailableError — checkout pakietowy ma się NIE zaczynać
// bez trwałego stanu (uczciwy komunikat dla klienta, zero udawania).
//
// Optimistic lock: UPDATE ... WHERE id AND stateVersion = expected (updateMany
// → count 0 przy wyścigu). Append logu kompensacji: atomowy konkat JSONB po
// stronie Postgresa (równoległe appendy się nie nadpisują).

import { getPrisma } from "@/lib/mvp/db";

import type {
  CompensationLogEntry,
  PackageBookingRecord,
  SagaStore,
} from "./orchestrator";

export class SagaStoreUnavailableError extends Error {
  constructor() {
    super(
      "Saga pakietów wymaga Postgresa: DATABASE_URL nie jest skonfigurowany " +
        "(bramka Fazy 2 — patrz docs/PACKAGES_DECISIONS.md).",
    );
    this.name = "SagaStoreUnavailableError";
  }
}

async function requirePrisma(): Promise<any> {
  const prisma = await getPrisma();
  if (!prisma) throw new SagaStoreUnavailableError();
  return prisma;
}

function toRecord(row: any): PackageBookingRecord {
  return {
    id: row.id,
    sagaState: row.sagaState,
    stateVersion: row.stateVersion,
    flightPrebookId: row.flightPrebookId,
    flightBookingId: row.flightBookingId,
    hotelPrebookId: row.hotelPrebookId,
    hotelBookingId: row.hotelBookingId,
    txnHotel: row.txnHotel,
    txnFlight: row.txnFlight,
    txnFlightHistory: Array.isArray(row.txnFlightHistoryJson) ? row.txnFlightHistoryJson : [],
    prebookExpiresAt: row.prebookExpiresAt ? row.prebookExpiresAt.toISOString() : null,
    deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
    failureReason: row.failureReason,
    stateLog: Array.isArray(row.stateLogJson) ? row.stateLogJson : [],
    compensationLog: Array.isArray(row.compensationLogJson) ? row.compensationLogJson : [],
  };
}

function toRow(rec: PackageBookingRecord): Record<string, unknown> {
  return {
    sagaState: rec.sagaState,
    stateVersion: rec.stateVersion,
    flightPrebookId: rec.flightPrebookId,
    flightBookingId: rec.flightBookingId,
    hotelPrebookId: rec.hotelPrebookId,
    hotelBookingId: rec.hotelBookingId,
    txnHotel: rec.txnHotel,
    txnFlight: rec.txnFlight,
    txnFlightHistoryJson: rec.txnFlightHistory,
    prebookExpiresAt: rec.prebookExpiresAt ? new Date(rec.prebookExpiresAt) : null,
    deadlineAt: rec.deadlineAt ? new Date(rec.deadlineAt) : null,
    failureReason: rec.failureReason,
    stateLogJson: rec.stateLog,
    // compensationLogJson celowo POZA update'em stanu — append-only przez
    // appendCompensationLog (atomowy konkat), żeby wyścig nie gubił wpisów.
  };
}

export interface PrismaSagaStore extends SagaStore {
  /** Utworzenie świeżej sagi (DRAFT) przy wejściu w checkout. */
  create(rec: PackageBookingRecord): Promise<void>;
}

export function createPrismaSagaStore(): PrismaSagaStore {
  return {
    async create(rec) {
      const prisma = await requirePrisma();
      await prisma.packageBooking.create({
        data: { id: rec.id, ...toRow(rec), compensationLogJson: rec.compensationLog },
      });
    },

    async load(id) {
      const prisma = await requirePrisma();
      const row = await prisma.packageBooking.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async update(id, expectedVersion, next) {
      const prisma = await requirePrisma();
      const res = await prisma.packageBooking.updateMany({
        where: { id, stateVersion: expectedVersion },
        data: toRow(next),
      });
      return res.count === 1;
    },

    async appendCompensationLog(id, entries: CompensationLogEntry[]) {
      if (!entries.length) return;
      const prisma = await requirePrisma();
      await prisma.$executeRaw`
        UPDATE "PackageBooking"
        SET "compensationLogJson" =
          COALESCE("compensationLogJson", '[]'::jsonb) || ${JSON.stringify(entries)}::jsonb
        WHERE "id" = ${id}`;
    },
  };
}
