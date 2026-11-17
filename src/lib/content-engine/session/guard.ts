export type SessionEnv = Readonly<Record<string, string | undefined>>;

export class PaidLlmCallBlockedError extends Error {
  readonly name = "PaidLlmCallBlockedError";

  constructor(readonly url: string) {
    super(`Tryb sesji SEO daily zablokował wywołanie płatnego API modelu: ${url}`);
  }
}

export interface NoPaidLlmGuard {
  blockedCount(): number;
  uninstall(): void;
}

function paidHost(hostname: string, additionalHost: string | null): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "api.anthropic.com" ||
    host === additionalHost ||
    host === "openrouter.ai" ||
    host === "api.openai.com" ||
    host === "generativelanguage.googleapis.com" ||
    host === "aiplatform.googleapis.com" ||
    /^bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com$/.test(host) ||
    host === "openai.azure.com" ||
    host.endsWith(".openai.azure.com")
  );
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return input;
    if (typeof input === "string") return new URL(input);
    return new URL(input.url);
  } catch {
    return null;
  }
}

export function assertNoPaidLlmCredentials(env: SessionEnv): void {
  if ((env.SEO_ENGINE_ANTHROPIC_API_KEY ?? "").trim() !== "") {
    throw new Error("Tryb sesji SEO daily nie może działać z ustawionym SEO_ENGINE_ANTHROPIC_API_KEY.");
  }
}

export function installNoPaidLlmGuard(env: SessionEnv): NoPaidLlmGuard {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") throw new Error("Środowisko nie udostępnia globalnego fetch.");

  let additionalHost: string | null = null;
  const configuredBase = (env.ANTHROPIC_BASE_URL ?? "").trim();
  if (configuredBase !== "") additionalHost = new URL(configuredBase).hostname.toLowerCase().replace(/\.$/, "");

  let blocked = 0;
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url && paidHost(url.hostname, additionalHost)) {
      blocked += 1;
      throw new PaidLlmCallBlockedError(url.href);
    }
    return originalFetch(input, init);
  };
  globalThis.fetch = guardedFetch;

  let installed = true;
  return {
    blockedCount: () => blocked,
    uninstall: () => {
      if (!installed) return;
      installed = false;
      if (globalThis.fetch === guardedFetch) globalThis.fetch = originalFetch;
    },
  };
}
