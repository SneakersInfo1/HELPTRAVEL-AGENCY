// Długość dnia z szerokości geograficznej i daty.
//
// To obliczenie astronomiczne, nie dana pogodowa: wynika z geometrii Ziemi
// i jest takie samo co roku (różnice między latami to pojedyncze minuty).
// Wzór wschodu i zachodu Słońca z deklinacją dla dnia roku; kąt −0,833°
// uwzględnia refrakcję i promień tarczy, tak jak w tablicach wschodów.

const RAD = Math.PI / 180;
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

/** Długość dnia w godzinach dla szerokości geograficznej i dnia roku (1–365). */
export function dayLengthHours(latitudeDeg: number, dayOfYear: number): number {
  const declination = 23.44 * RAD * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latitude = latitudeDeg * RAD;
  const cosHourAngle = (Math.sin(-0.833 * RAD) - Math.sin(latitude) * Math.sin(declination)) / (Math.cos(latitude) * Math.cos(declination));
  // Noc polarna i dzień polarny: brak wschodu albo zachodu.
  if (cosHourAngle >= 1) return 0;
  if (cosHourAngle <= -1) return 24;
  return (2 * Math.acos(cosHourAngle)) / RAD / 15;
}

/** Długość dnia w połowie miesiąca (15. dzień), zaokrąglona do 5 minut. */
export function midMonthDayLength(latitudeDeg: number, monthIndex: number): { hours: number; minutes: number; totalMinutes: number } {
  const total = Math.round((dayLengthHours(latitudeDeg, DAYS_BEFORE_MONTH[monthIndex] + 15) * 60) / 5) * 5;
  return { hours: Math.floor(total / 60), minutes: total % 60, totalMinutes: total };
}

export function formatDayLength(value: { hours: number; minutes: number }): string {
  return value.minutes === 0 ? `${value.hours} h` : `${value.hours} h ${value.minutes} min`;
}
