export type Sleep = (milliseconds: number) => Promise<void>;

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: Sleep;
  random?: () => number;
  isRetryable?: (error: unknown) => boolean;
}

interface StatusLike {
  status?: unknown;
  retryable?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

export function defaultIsRetryable(error: unknown): boolean {
  if (!(error instanceof Error) && (error === null || typeof error !== "object")) return false;
  const candidate = error as StatusLike;
  if (typeof candidate.retryable === "boolean") return candidate.retryable;
  if (typeof candidate.status === "number") {
    if ([400, 401, 403].includes(candidate.status)) return false;
    return candidate.status === 429 || candidate.status >= 500;
  }
  const code = typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return name === "AbortError" || ["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET"].includes(code) || /timed?\s*out/i.test(message);
}

const realSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** `retries` oznacza liczbę ponowień po pierwszej próbie. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseMs = options.baseMs ?? 250;
  const maxMs = options.maxMs ?? 10_000;
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = Math.max(0, Math.min(1, random())) * ceiling;
      await sleep(jitter);
    }
  }
}

