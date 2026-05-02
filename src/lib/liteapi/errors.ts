// LiteAPI typed error hierarchy. Every external boundary of /lib/liteapi/*
// throws ONE of these subclasses. Application code maps `userMessagePl` to
// UI; logs use `internalCode` for grep.

export type LiteApiErrorCode =
  | "LITEAPI_NETWORK"
  | "LITEAPI_TIMEOUT"
  | "LITEAPI_VALIDATION"
  | "LITEAPI_RATE_EXPIRED"
  | "LITEAPI_SOLD_OUT"
  | "LITEAPI_PAYMENT_DECLINED"
  | "LITEAPI_WEBHOOK_SIGNATURE"
  | "LITEAPI_AUTH"
  | "LITEAPI_RATE_LIMITED"
  | "LITEAPI_UNKNOWN";

interface LiteApiErrorOptions {
  status?: number;
  body?: unknown;
  cause?: unknown;
}

export class LiteApiError extends Error {
  readonly internalCode: LiteApiErrorCode;
  readonly status?: number;
  readonly body?: unknown;
  readonly userMessagePl: string;

  constructor(
    code: LiteApiErrorCode,
    message: string,
    userMessagePl: string,
    opts: LiteApiErrorOptions = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = code;
    this.internalCode = code;
    this.status = opts.status;
    this.body = opts.body;
    this.userMessagePl = userMessagePl;
  }
}

export class LiteApiNetworkError extends LiteApiError {
  constructor(message: string, opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_NETWORK", message, "Chwilowy problem z połączeniem. Spróbuj ponownie za moment.", opts);
  }
}

export class LiteApiTimeoutError extends LiteApiError {
  constructor(message: string, opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_TIMEOUT", message, "Operacja trwa dłużej niż zwykle. Spróbuj jeszcze raz.", opts);
  }
}

export class LiteApiValidationError extends LiteApiError {
  constructor(message: string, opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_VALIDATION", message, "Otrzymaliśmy niespodziewaną odpowiedź od dostawcy. Już to sprawdzamy.", opts);
  }
}

export class LiteApiRateExpiredError extends LiteApiError {
  constructor(message = "Rate expired", opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_RATE_EXPIRED", message, "Cena tej oferty wygasła. Wybierz ofertę ponownie, aby pobrać aktualną stawkę.", opts);
  }
}

export class LiteApiSoldOutError extends LiteApiError {
  constructor(message = "Sold out", opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_SOLD_OUT", message, "Ten pokój nie jest już dostępny. Wybierz inną ofertę.", opts);
  }
}

export class LiteApiPaymentDeclinedError extends LiteApiError {
  constructor(message = "Payment declined", opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_PAYMENT_DECLINED", message, "Płatność została odrzucona. Sprawdź dane karty lub spróbuj inną metodę.", opts);
  }
}

export class LiteApiWebhookSignatureError extends LiteApiError {
  constructor(message = "Webhook signature mismatch", opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_WEBHOOK_SIGNATURE", message, "Wewnętrzny błąd weryfikacji.", opts);
  }
}

export class LiteApiAuthError extends LiteApiError {
  constructor(message = "Unauthorized", opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_AUTH", message, "Wewnętrzny błąd autoryzacji dostawcy.", opts);
  }
}

export class LiteApiRateLimitError extends LiteApiError {
  constructor(message = "Rate limited", opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_RATE_LIMITED", message, "Zbyt wiele żądań w krótkim czasie. Spróbuj ponownie za chwilę.", opts);
  }
}

export class LiteApiUnknownError extends LiteApiError {
  constructor(message = "Unknown error", opts: LiteApiErrorOptions = {}) {
    super("LITEAPI_UNKNOWN", message, "Coś poszło nie tak. Spróbuj jeszcze raz lub napisz do nas.", opts);
  }
}

// Map an HTTP status + body to the right error subclass.
export function liteApiErrorFromResponse(status: number, body: unknown): LiteApiError {
  const opts = { status, body };
  if (status === 401 || status === 403) return new LiteApiAuthError(`HTTP ${status}`, opts);
  if (status === 408) return new LiteApiTimeoutError(`HTTP ${status}`, opts);
  if (status === 409) return new LiteApiRateExpiredError(`HTTP ${status}`, opts);
  if (status === 410) return new LiteApiSoldOutError(`HTTP ${status}`, opts);
  if (status === 422) return new LiteApiValidationError(`HTTP ${status}`, opts);
  if (status === 429) return new LiteApiRateLimitError(`HTTP ${status}`, opts);
  if (status >= 500) return new LiteApiNetworkError(`HTTP ${status}`, opts);
  return new LiteApiUnknownError(`HTTP ${status}`, opts);
}
