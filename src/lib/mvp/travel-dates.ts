const DEFAULT_START_OFFSET_DAYS = 30;
const DEFAULT_NIGHTS = 4;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultTravelStartDate(offsetDays = DEFAULT_START_OFFSET_DAYS): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatDate(date);
}

export function defaultTravelEndDate(offsetDays = DEFAULT_START_OFFSET_DAYS, nights = DEFAULT_NIGHTS): string {
  return addDaysToIsoDate(defaultTravelStartDate(offsetDays), Math.max(1, nights));
}

export function addDaysToIsoDate(value: string, days: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setDate(date.getDate() + days);
  return formatDate(date);
}

export function countNightsBetweenIsoDates(startDate: string, endDate: string, fallback = DEFAULT_NIGHTS): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return fallback;
  }

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

export function normalizeTravelEndDate(startDate: string, endDate: string | undefined, fallbackNights = DEFAULT_NIGHTS): string {
  const normalizedStart = new Date(startDate);
  if (Number.isNaN(normalizedStart.getTime())) {
    return endDate ?? defaultTravelEndDate();
  }

  if (!endDate) {
    return addDaysToIsoDate(startDate, Math.max(1, fallbackNights));
  }

  const normalizedEnd = new Date(endDate);
  if (Number.isNaN(normalizedEnd.getTime()) || normalizedEnd.getTime() <= normalizedStart.getTime()) {
    return addDaysToIsoDate(startDate, Math.max(1, fallbackNights));
  }

  return endDate;
}

export function isoDateToMonth(value: string): number | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.getMonth() + 1;
}

export function formatShortDate(value: string, locale = "pl-PL"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  }).format(date);
}
