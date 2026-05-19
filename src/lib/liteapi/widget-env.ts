/**
 * Returns the LiteAPI Payment SDK environment flag.
 * Per LiteAPI support: this is "live" or "sandbox", NOT an API key.
 * Reads NEXT_PUBLIC_LITEAPI_ENV (client-safe; mirrors server LITEAPI_ENV).
 */
export function getLiteApiWidgetEnv(): "live" | "sandbox" {
  const env = process.env.NEXT_PUBLIC_LITEAPI_ENV;
  return env === "production" ? "live" : "sandbox";
}
