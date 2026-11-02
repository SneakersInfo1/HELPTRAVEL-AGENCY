import type { Instrumentation } from "next";

// Hak Nexta dla NIEOBSŁUŻONYCH błędów serwera — liczy je i alarmuje przy serii
// (src/lib/alerting/server-errors.ts). Tylko runtime Node: tam działają nasze
// trasy, a gałąź jest wycinana z pakietu edge na etapie budowania.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("@/lib/alerting/server-errors");
  await recordServerError(err, request, context);
};
