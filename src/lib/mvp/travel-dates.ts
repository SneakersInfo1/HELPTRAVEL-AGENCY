const DEFAULT_START_OFFSET_DAYS = 30;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultTravelStartDate(offsetDays = DEFAULT_START_OFFSET_DAYS): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatDate(date);
}

export function addDaysToIsoDate(value: string, days: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setDate(date.getDate() + days);
  return formatDate(date);
}

export function isoDateToMonth(value: string): number | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.getMonth() + 1;
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
  }).format(date);
}
